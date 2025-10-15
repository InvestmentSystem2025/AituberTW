from flask import Flask, request, jsonify
from flask_cors import CORS
import pytesseract
from pdf2image import convert_from_bytes, convert_from_path
from PIL import Image, ImageEnhance, ImageFilter
import os
import io
import base64
import logging
import numpy as np
import cv2

app = Flask(__name__)
CORS(app)

# 設定日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 臨時目錄
TEMP_DIR = '/app/temp'

def preprocess_image(image):
    """
    圖像預處理：提高對比度和銳度，改善 OCR 識別率
    特別針對白色文字在淺色背景的問題
    """
    # 轉換為 numpy array 以使用 OpenCV
    img_array = np.array(image)
    
    # 轉換為灰度圖
    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    else:
        gray = img_array
    
    # 1. 自適應直方圖均衡化（CLAHE）- 提高局部對比度
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    # 2. 二值化 - 使用自適應閾值
    binary = cv2.adaptiveThreshold(
        enhanced,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11,  # 塊大小
        2    # 常數
    )
    
    # 3. 降噪
    denoised = cv2.fastNlMeansDenoising(binary, None, 10, 7, 21)
    
    # 4. 銳化
    kernel = np.array([[-1,-1,-1],
                       [-1, 9,-1],
                       [-1,-1,-1]])
    sharpened = cv2.filter2D(denoised, -1, kernel)
    
    # 轉回 PIL Image
    result = Image.fromarray(sharpened)
    
    return result

@app.route('/health', methods=['GET'])
def health():
    """健康檢查端點"""
    return jsonify({
        'status': 'ok',
        'service': 'OCR Service',
        'tesseract_version': str(pytesseract.get_tesseract_version())
    })

@app.route('/ocr/pdf-file', methods=['POST'])
def ocr_pdf_file():
    """
    PDF OCR 端點（使用檔案路徑）
    接收 PDF 檔案路徑，轉換為圖像並執行 OCR
    """
    try:
        # 從 JSON 獲取參數
        data = request.get_json()
        
        if not data or 'filePath' not in data:
            return jsonify({
                'success': False,
                'error': '未提供 filePath 參數'
            }), 400

        file_path = data['filePath']
        
        # 如果是相對路徑，加上 upload 目錄
        if not os.path.isabs(file_path):
            file_path = os.path.join('/app/uploads', file_path)
        
        # 檢查檔案是否存在
        if not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'error': f'檔案不存在: {file_path}'
            }), 404

        logger.info(f"處理 PDF 檔案: {file_path}")

        # 獲取語言參數（預設繁體中文+英文+日文）
        lang = data.get('lang', 'chi_tra+eng+jpn')
        
        # 獲取 DPI 參數（預設 300）
        dpi = int(data.get('dpi', '300'))
        
        # 獲取裁切參數（可選）- 用於去除 banner
        crop_top = int(data.get('crop_top', '0'))  # 從頂部裁切的像素數
        crop_bottom = int(data.get('crop_bottom', '0'))  # 從底部裁切的像素數
        crop_left = int(data.get('crop_left', '0'))  # 從左側裁切的像素數
        crop_right = int(data.get('crop_right', '0'))  # 從右側裁切的像素數

        # 步驟 1: PDF 轉圖像
        logger.info("開始將 PDF 轉換為圖像...")
        try:
            images = convert_from_path(
                file_path,
                dpi=dpi,
                fmt='png',
                thread_count=4
            )
            logger.info(f"✅ PDF 轉換成功！共 {len(images)} 頁")
            
            # 如果需要裁切，處理每張圖片
            if crop_top > 0 or crop_bottom > 0 or crop_left > 0 or crop_right > 0:
                logger.info(f"裁切設定 - 上:{crop_top} 下:{crop_bottom} 左:{crop_left} 右:{crop_right}")
                cropped_images = []
                for idx, img in enumerate(images):
                    width, height = img.size
                    # 計算裁切後的區域
                    left = crop_left
                    top = crop_top
                    right = width - crop_right
                    bottom = height - crop_bottom
                    
                    # 裁切圖片
                    cropped_img = img.crop((left, top, right, bottom))
                    cropped_images.append(cropped_img)
                    logger.info(f"第 {idx+1} 頁裁切: {width}x{height} -> {cropped_img.size[0]}x{cropped_img.size[1]}")
                
                images = cropped_images
            
            conversion_result = {
                'success': True,
                'page_count': len(images),
                'dpi': dpi,
                'message': f'PDF 成功轉換為 {len(images)} 張圖像'
            }
            
        except Exception as e:
            logger.error(f"❌ PDF 轉圖像失敗: {str(e)}")
            return jsonify({
                'success': False,
                'error': f'PDF 轉圖像失敗: {str(e)}',
                'stage': 'pdf_to_image'
            }), 500

        # 獲取圖像預處理選項
        enhance = data.get('enhance', False)  # 預設停用增強
        
        # 步驟 2: OCR 識別
        logger.info("開始 OCR 識別...")
        ocr_results = []
        full_text = []

        for i, image in enumerate(images, 1):
            try:
                logger.info(f"處理第 {i}/{len(images)} 頁...")
                
                # 圖像預處理（提高對比度、銳化）
                if enhance:
                    image = preprocess_image(image)
                    logger.info(f"第 {i} 頁已進行圖像增強處理")
                
                text = pytesseract.image_to_string(
                    image,
                    lang=lang,
                    config='--psm 6 --oem 3'
                )
                
                text = text.strip()
                logger.info(f"第 {i} 頁提取了 {len(text)} 個字符")
                
                ocr_results.append({
                    'page': i,
                    'text': text,
                    'char_count': len(text)
                })
                
                full_text.append(text)
                
            except Exception as e:
                logger.error(f"第 {i} 頁 OCR 失敗: {str(e)}")
                ocr_results.append({
                    'page': i,
                    'text': '',
                    'error': str(e)
                })

        logger.info(f"✅ OCR 完成！總共提取 {sum(len(t) for t in full_text)} 個字符")

        return jsonify({
            'success': True,
            'conversion': conversion_result,
            'ocr': {
                'total_pages': len(images),
                'language': lang,
                'full_text': '\n\n'.join(full_text),
                'pages': ocr_results,
                'total_chars': sum(len(t) for t in full_text)
            }
        })

    except Exception as e:
        logger.error(f"處理失敗: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e),
            'stage': 'unknown'
        }), 500

@app.route('/ocr/pdf', methods=['POST'])
def ocr_pdf():
    """
    PDF OCR 端點
    接收 PDF 文件，轉換為圖像並執行 OCR
    """
    try:
        # 檢查是否有文件
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': '未提供 PDF 文件'
            }), 400

        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': '文件名為空'
            }), 400

        # 讀取 PDF 文件內容
        pdf_bytes = file.read()
        logger.info(f"收到 PDF 文件: {file.filename}, 大小: {len(pdf_bytes)} bytes")

        # 獲取語言參數（預設繁體中文+英文+日文）
        lang = request.form.get('lang', 'chi_tra+eng+jpn')
        
        # 獲取 DPI 參數（預設 300）
        dpi = int(request.form.get('dpi', '300'))

        # 步驟 1: PDF 轉圖像
        logger.info("開始將 PDF 轉換為圖像...")
        try:
            images = convert_from_bytes(
                pdf_bytes,
                dpi=dpi,
                fmt='png',
                thread_count=4
            )
            logger.info(f"✅ PDF 轉換成功！共 {len(images)} 頁")
            
            # 回傳轉換成功的訊息
            conversion_result = {
                'success': True,
                'page_count': len(images),
                'dpi': dpi,
                'message': f'PDF 成功轉換為 {len(images)} 張圖像'
            }
            
        except Exception as e:
            logger.error(f"❌ PDF 轉圖像失敗: {str(e)}")
            return jsonify({
                'success': False,
                'error': f'PDF 轉圖像失敗: {str(e)}',
                'stage': 'pdf_to_image'
            }), 500

        # 步驟 2: OCR 識別
        logger.info("開始 OCR 識別...")
        ocr_results = []
        full_text = []

        for i, image in enumerate(images, 1):
            try:
                logger.info(f"處理第 {i}/{len(images)} 頁...")
                
                # 執行 OCR
                text = pytesseract.image_to_string(
                    image,
                    lang=lang,
                    config='--psm 6 --oem 3'  # PSM 6: 假設單一文字區塊, OEM 3: 預設 OCR 引擎
                )
                
                # 清理文本
                text = text.strip()
                
                logger.info(f"第 {i} 頁提取了 {len(text)} 個字符")
                
                ocr_results.append({
                    'page': i,
                    'text': text,
                    'char_count': len(text)
                })
                
                full_text.append(text)
                
            except Exception as e:
                logger.error(f"第 {i} 頁 OCR 失敗: {str(e)}")
                ocr_results.append({
                    'page': i,
                    'text': '',
                    'error': str(e)
                })

        logger.info(f"✅ OCR 完成！總共提取 {sum(len(t) for t in full_text)} 個字符")

        # 回傳完整結果
        return jsonify({
            'success': True,
            'conversion': conversion_result,
            'ocr': {
                'total_pages': len(images),
                'language': lang,
                'full_text': '\n\n'.join(full_text),
                'pages': ocr_results,
                'total_chars': sum(len(t) for t in full_text)
            }
        })

    except Exception as e:
        logger.error(f"處理失敗: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e),
            'stage': 'unknown'
        }), 500

@app.route('/ocr/image', methods=['POST'])
def ocr_image():
    """
    圖像 OCR 端點
    接收單張圖像並執行 OCR
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': '未提供圖像文件'
            }), 400

        file = request.files['file']
        lang = request.form.get('lang', 'chi_tra+eng+jpn')

        # 讀取圖像
        image = Image.open(file.stream)
        
        # 執行 OCR
        text = pytesseract.image_to_string(
            image,
            lang=lang,
            config='--psm 6 --oem 3'
        )

        return jsonify({
            'success': True,
            'text': text.strip(),
            'char_count': len(text.strip())
        })

    except Exception as e:
        logger.error(f"圖像 OCR 失敗: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)


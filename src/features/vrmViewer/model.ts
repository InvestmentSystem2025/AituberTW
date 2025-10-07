import * as THREE from 'three'
import {
  VRM,
  VRMExpressionPresetName,
  VRMLoaderPlugin,
  VRMUtils,
} from '@pixiv/three-vrm'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimation } from '../../lib/VRMAnimation/VRMAnimation'
import { VRMLookAtSmootherLoaderPlugin } from '@/lib/VRMLookAtSmootherLoaderPlugin/VRMLookAtSmootherLoaderPlugin'
import { LipSync } from '../lipSync/lipSync'
import { EmoteController } from '../emoteController/emoteController'
import { Talk } from '../messages/messages'

/**
 * 3Dキャラクターを管理するクラス
 */
export class Model {
  public vrm?: VRM | null
  public mixer?: THREE.AnimationMixer
  public emoteController?: EmoteController

  private _lookAtTargetParent: THREE.Object3D
  private _lipSync?: LipSync
  private _mouthAnimationTimer?: NodeJS.Timeout
  private _currentMouthShape: 'aa' | 'oh' = 'aa'
  private _emotionTransitionTimer?: NodeJS.Timeout

  constructor(lookAtTargetParent: THREE.Object3D) {
    this._lookAtTargetParent = lookAtTargetParent
    this._lipSync = new LipSync(new AudioContext(), { forceStart: true })
  }

  public async loadVRM(url: string): Promise<void> {
    const loader = new GLTFLoader()
    loader.register(
      (parser) =>
        new VRMLoaderPlugin(parser, {
          lookAtPlugin: new VRMLookAtSmootherLoaderPlugin(parser),
        })
    )

    const gltf = await loader.loadAsync(url)

    const vrm = (this.vrm = gltf.userData.vrm)
    vrm.scene.name = 'VRMRoot'

    VRMUtils.rotateVRM0(vrm)
    this.mixer = new THREE.AnimationMixer(vrm.scene)

    this.emoteController = new EmoteController(vrm, this._lookAtTargetParent)
  }

  public unLoadVrm() {
    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene)
      this.vrm = null
    }
  }

  /**
   * VRMアニメーションを読み込む
   *
   * https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/README.ja.md
   */
  public async loadAnimation(vrmAnimation: VRMAnimation): Promise<void> {
    const { vrm, mixer } = this
    if (vrm == null || mixer == null) {
      throw new Error('You have to load VRM first')
    }

    const clip = vrmAnimation.createAnimationClip(vrm)
    const action = mixer.clipAction(clip)
    action.play()
  }

  /**
   * 音声を再生し、リップシンクを行う
   * 
   * 新しい表情ロジック：
   * 1. 音声再生開始（relaxed 表情を維持）
   * 2. 第一句話結束後（約1秒後）顯示情感表情
   * 3. 情感表情持續 1.5 秒
   * 4. 切換回 relaxed 表情繼續說話
   */
  public async speak(
    buffer: ArrayBuffer,
    talk: Talk,
    isNeedDecode: boolean = true
  ) {
    // 清除之前的表情過渡計時器
    if (this._emotionTransitionTimer) {
      clearTimeout(this._emotionTransitionTimer)
      this._emotionTransitionTimer = undefined
    }

    // 開始說話時保持 relaxed 表情
    console.log('🎭 開始說話，保持 relaxed 表情')
    this.emoteController?.playEmotion('relaxed')
    
    // 如果有特定情感標籤且不是 neutral 或 relaxed
    const shouldShowEmotion = talk.emotion && 
                              talk.emotion !== 'neutral' && 
                              talk.emotion !== 'relaxed'
    
    if (shouldShowEmotion) {
      // 第一句話結束後（1秒）顯示情感表情
      this._emotionTransitionTimer = setTimeout(() => {
        console.log(`🎭 顯示情感表情: ${talk.emotion}`)
        this.emoteController?.playEmotion(talk.emotion)
        
        // 1.5秒後回到 relaxed 表情
        this._emotionTransitionTimer = setTimeout(() => {
          console.log('🎭 回到 relaxed 表情')
          this.emoteController?.playEmotion('relaxed')
          this._emotionTransitionTimer = undefined
        }, 1500)
      }, 1000)
    }

    await new Promise((resolve) => {
      this._lipSync?.playFromArrayBuffer(
        buffer,
        () => {
          resolve(true)
        },
        isNeedDecode
      )
    })
  }

  /**
   * 現在の音声再生を停止
   */
  public stopSpeaking() {
    this._lipSync?.stopCurrentPlayback()
    
    // 清理所有計時器
    if (this._mouthAnimationTimer) {
      clearInterval(this._mouthAnimationTimer)
      this._mouthAnimationTimer = undefined
    }
    
    if (this._emotionTransitionTimer) {
      clearTimeout(this._emotionTransitionTimer)
      this._emotionTransitionTimer = undefined
    }
    
    this._currentMouthShape = 'aa'
  }

  /**
   * 感情表現を再生する
   */
  public async playEmotion(preset: VRMExpressionPresetName) {
    this.emoteController?.playEmotion(preset)
  }

  /**
   * 開始交替的嘴型動畫（aa 和 oh 交替，每個 0.2 秒）
   */
  private startMouthAnimation(): void {
    if (this._mouthAnimationTimer) {
      clearInterval(this._mouthAnimationTimer)
    }
    
    this._mouthAnimationTimer = setInterval(() => {
      // 切換嘴型
      this._currentMouthShape = this._currentMouthShape === 'aa' ? 'oh' : 'aa'
    }, 200) // 每 0.2 秒切換一次
  }

  /**
   * 停止嘴型動畫
   */
  private stopMouthAnimation(): void {
    if (this._mouthAnimationTimer) {
      clearInterval(this._mouthAnimationTimer)
      this._mouthAnimationTimer = undefined
    }
    this._currentMouthShape = 'aa'
  }

  public update(delta: number): void {
    if (this._lipSync) {
      const { volume } = this._lipSync.update()
      
      // 如果有音量（正在說話）
      if (volume > 0.01) {
        // 啟動交替嘴型動畫（如果還沒啟動）
        if (!this._mouthAnimationTimer) {
          this.startMouthAnimation()
        }
        
        // 使用當前的嘴型（aa 或 oh）
        this.emoteController?.lipSync(this._currentMouthShape, volume)
      } else {
        // 沒有音量時停止動畫並閉嘴
        if (this._mouthAnimationTimer) {
          this.stopMouthAnimation()
        }
        this.emoteController?.lipSync('aa', 0)
      }
    }

    this.emoteController?.update(delta)
    this.mixer?.update(delta)
    this.vrm?.update(delta)
  }
}

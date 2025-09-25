import React from 'react'

interface Answer {
  question: {
    id: string
    text: string
    category: string
    difficulty: string
  }
  answer: string
  timestamp: Date
}

interface InterviewResultsProps {
  answers: Answer[]
  onRestart: () => void
  onExit: () => void
}

export const InterviewResults: React.FC<InterviewResultsProps> = ({
  answers,
  onRestart,
  onExit,
}) => {
  const totalQuestions = answers.length
  const completedAnswers = answers.filter(
    (answer) => answer.answer.trim().length > 0
  ).length

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'text-green-600 bg-green-100'
      case 'medium':
        return 'text-yellow-600 bg-yellow-100'
      case 'hard':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getDifficultyText = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return '簡單'
      case 'medium':
        return '中等'
      case 'hard':
        return '困難'
      default:
        return '未知'
    }
  }

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-70">
      <div className="bg-white rounded-lg p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* 標題和統計 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">面試結果</h1>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">
                {totalQuestions}
              </div>
              <div className="text-sm text-gray-600">總問題數</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">
                {completedAnswers}
              </div>
              <div className="text-sm text-gray-600">已回答</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-600">
                {totalQuestions > 0
                  ? Math.round((completedAnswers / totalQuestions) * 100)
                  : 0}
                %
              </div>
              <div className="text-sm text-gray-600">完成率</div>
            </div>
          </div>
        </div>

        {/* 回答詳情 */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">回答詳情</h2>
          <div className="space-y-6">
            {answers.map((answer, index) => (
              <div
                key={answer.question.id}
                className="border border-gray-200 rounded-lg p-6"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-600">
                        問題 {index + 1}
                      </span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(answer.question.difficulty)}`}
                      >
                        {getDifficultyText(answer.question.difficulty)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {answer.question.category}
                      </span>
                    </div>
                    <h3 className="text-lg font-medium text-gray-800 mb-3">
                      {answer.question.text}
                    </h3>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-2">您的回答：</div>
                  {answer.answer.trim() ? (
                    <div className="text-gray-800 whitespace-pre-wrap">
                      {answer.answer}
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">未回答</div>
                  )}
                </div>

                <div className="text-xs text-gray-500 mt-2">
                  回答時間: {answer.timestamp.toLocaleString('zh-TW')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="flex justify-center gap-4">
          <button
            onClick={onRestart}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
          >
            重新開始面試
          </button>
          <button
            onClick={onExit}
            className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            結束面試
          </button>
        </div>
      </div>
    </div>
  )
}

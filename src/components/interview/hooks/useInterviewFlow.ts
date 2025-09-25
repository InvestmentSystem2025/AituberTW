import { useState, useEffect, useCallback } from 'react'
import { usePersonDetection, PersonDetectionState } from './usePersonDetection'

export interface Answer {
  question: {
    id: string
    text: string
    category: string
    difficulty: string
  }
  answer: string
  timestamp: Date
}

export interface InterviewFlowState extends PersonDetectionState {
  interviewStarted: boolean
  answers: Answer[]
  showResults: boolean
}

export const useInterviewFlow = () => {
  const personDetection = usePersonDetection()
  const [interviewStarted, setInterviewStarted] = useState(false)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [showResults, setShowResults] = useState(false)

  // 重置面試流程
  const resetInterview = useCallback(() => {
    setInterviewStarted(false)
    personDetection.resetDetection()
  }, [personDetection])

  // 手動開始面試
  const startInterviewManually = useCallback(() => {
    setInterviewStarted(true)
    personDetection.startInterview()
  }, [personDetection])

  // 添加回答
  const addAnswer = useCallback(
    (question: Answer['question'], answer: string) => {
      const newAnswer: Answer = {
        question,
        answer,
        timestamp: new Date(),
      }
      setAnswers((prev) => [...prev, newAnswer])
    },
    []
  )

  // 完成面試並顯示結果
  const completeInterview = useCallback(() => {
    setInterviewStarted(false)
    setShowResults(true)
  }, [])

  // 重新開始面試
  const restartInterview = useCallback(() => {
    setAnswers([])
    setShowResults(false)
    setInterviewStarted(false)
    personDetection.resetDetection()
  }, [personDetection])

  // 退出面試
  const exitInterview = useCallback(() => {
    setShowResults(false)
    setAnswers([])
    setInterviewStarted(false)
    personDetection.resetDetection()
  }, [personDetection])

  return {
    ...personDetection,
    interviewStarted,
    answers,
    showResults,
    resetInterview,
    startInterviewManually,
    addAnswer,
    completeInterview,
    restartInterview,
    exitInterview,
  }
}

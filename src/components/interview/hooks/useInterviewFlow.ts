import { useState, useEffect, useCallback } from 'react'
import { usePersonDetection, PersonDetectionState } from './usePersonDetection'
import { InterviewResult } from '@/types/interviewScoring'

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
  interviewResult?: InterviewResult
}

export const useInterviewFlow = () => {
  const personDetection = usePersonDetection()
  const [interviewStarted, setInterviewStarted] = useState(false)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [showResults, setShowResults] = useState(false)
  const [interviewResult, setInterviewResult] = useState<InterviewResult | undefined>(undefined)
  const [interviewStatus, setInterviewStatus] = useState<'waiting' | 'detecting' | 'ready' | 'interviewing' | 'completed'>('waiting')

  // 重置面試流程
  const resetInterview = useCallback(() => {
    setInterviewStarted(false)
    setInterviewStatus('waiting')
    personDetection.resetDetection()
  }, [personDetection])

  // 手動開始面試
  const startInterviewManually = useCallback(() => {
    setInterviewStarted(true)
    setInterviewStatus('interviewing')
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
  const completeInterview = useCallback((result?: InterviewResult) => {
    setInterviewStarted(false)
    setInterviewStatus('completed')
    if (result) {
      setInterviewResult(result)
    }
    setShowResults(true)
  }, [])

  // 重新開始面試
  const restartInterview = useCallback(() => {
    setAnswers([])
    setShowResults(false)
    setInterviewStarted(false)
    setInterviewStatus('waiting')
    setInterviewResult(undefined)
    personDetection.resetDetection()
  }, [personDetection])

  // 退出面試
  const exitInterview = useCallback(() => {
    setShowResults(false)
    setAnswers([])
    setInterviewStarted(false)
    setInterviewStatus('waiting')
    setInterviewResult(undefined)
    personDetection.resetDetection()
  }, [personDetection])

  return {
    ...personDetection,
    interviewStarted,
    answers,
    showResults,
    interviewResult,
    interviewStatus,
    resetInterview,
    startInterviewManually,
    addAnswer,
    completeInterview,
    restartInterview,
    exitInterview,
  }
}

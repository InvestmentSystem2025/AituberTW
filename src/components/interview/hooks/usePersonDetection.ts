import { useState, useCallback } from 'react'

export interface PersonDetectionState {
  isPersonDetected: boolean
  detectionConfidence: number
  isDetecting: boolean
  detectionError: string | null
  interviewStatus: 'waiting' | 'detecting' | 'ready' | 'interviewing'
}

export const usePersonDetection = () => {
  const [state, setState] = useState<PersonDetectionState>({
    isPersonDetected: false,
    detectionConfidence: 0,
    isDetecting: false,
    detectionError: null,
    interviewStatus: 'waiting',
  })

  const handlePersonDetected = useCallback(
    (isDetected: boolean, confidence: number) => {
      setState((prev) => ({
        ...prev,
        isPersonDetected: isDetected,
        detectionConfidence: confidence,
        interviewStatus: isDetected ? 'ready' : 'detecting',
      }))
    },
    []
  )

  const handleDetectionError = useCallback((error: string) => {
    setState((prev) => ({
      ...prev,
      detectionError: error,
      isDetecting: false,
      interviewStatus: 'waiting',
    }))
  }, [])

  const startInterview = useCallback(() => {
    setState((prev) => ({
      ...prev,
      interviewStatus: 'interviewing',
    }))
  }, [])

  const resetDetection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isPersonDetected: false,
      detectionConfidence: 0,
      detectionError: null,
      interviewStatus: 'waiting',
    }))
  }, [])

  return {
    ...state,
    handlePersonDetected,
    handleDetectionError,
    startInterview,
    resetDetection,
  }
}

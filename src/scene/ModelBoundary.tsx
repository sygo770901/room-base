import { Component, type ReactNode } from 'react'
import { useAppStore } from '../store'

type Props = { file: string; children: ReactNode; fallback?: ReactNode }
type State = { failed: boolean }

/** 單一模型失敗時留下替代物，並把檔名交給載入失敗提示。不要讓整張畫布變黑。 */
export class ModelBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    const fromError = error?.message || ''
    useAppStore.getState().addMapLoadError(fromError.includes('.') ? fromError : this.props.file)
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null
    return this.props.children
  }
}

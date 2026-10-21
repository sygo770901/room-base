import { Component, type ReactNode } from 'react'
import { FallbackDungeon } from './FallbackDungeon'
import { useAppStore } from '../store'

type Props = { children: ReactNode }

type State = { failed: boolean }

export class DungeonBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    const store = useAppStore.getState()
    store.addMapLoadError(error.message || '地城模型.gltf')
    store.setMapLoadFailed(true)
  }

  render() {
    if (this.state.failed) return <FallbackDungeon />
    return this.props.children
  }
}

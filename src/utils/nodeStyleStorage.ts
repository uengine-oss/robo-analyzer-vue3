/**
 * nodeStyleStorage.ts
 * 노드 스타일 설정 저장 및 관리 유틸리티
 * 
 * localStorage를 사용하여 노드 타입별 색상 및 크기 설정을 저장하고 불러옵니다.
 */

const STORAGE_KEY = 'legacy-modernizer-node-styles'

export interface NodeStyleConfig {
  color?: string
  size?: number
}

export type NodeStyleMap = Record<string, NodeStyleConfig>

/**
 * localStorage에서 노드 스타일 설정 로드
 */
export function loadNodeStyles(): NodeStyleMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}
    
    const parsed = JSON.parse(stored) as NodeStyleMap
    return parsed
  } catch (e) {
    console.warn('노드 스타일 설정 로드 실패:', e)
    return {}
  }
}

/**
 * localStorage에 노드 스타일 설정 저장
 */
export function saveNodeStyles(styles: NodeStyleMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles))
  } catch (e) {
    console.warn('노드 스타일 설정 저장 실패:', e)
  }
}

/**
 * 특정 노드 타입의 스타일 설정 가져오기
 */
export function getNodeStyle(nodeType: string): NodeStyleConfig | null {
  const styles = loadNodeStyles()
  return styles[nodeType] || null
}

/**
 * 특정 노드 타입의 색상 설정
 */
export function setNodeColor(nodeType: string, color: string): void {
  const styles = loadNodeStyles()
  if (!styles[nodeType]) {
    styles[nodeType] = {}
  }
  styles[nodeType].color = color
  saveNodeStyles(styles)
}

/**
 * 특정 노드 타입의 크기 설정
 */
export function setNodeSize(nodeType: string, size: number): void {
  const styles = loadNodeStyles()
  if (!styles[nodeType]) {
    styles[nodeType] = {}
  }
  styles[nodeType].size = size
  saveNodeStyles(styles)
}

/**
 * 특정 노드 타입의 스타일 설정 제거
 */
export function removeNodeStyle(nodeType: string): void {
  const styles = loadNodeStyles()
  delete styles[nodeType]
  saveNodeStyles(styles)
}

/**
 * 모든 노드 스타일 설정 초기화
 */
export function clearNodeStyles(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.warn('노드 스타일 설정 초기화 실패:', e)
  }
}


/**
 * 업로드 관련 유틸(단일 파일로 통일)
 *
 * 유지보수 원칙:
 * - “규칙/계산(도메인 로직)”만 여기에 둔다 (UI 상태/emit 등은 컴포넌트에 둔다)
 * - 업로드 경로는 항상 “projectName 최상위 + 상대경로(webkitRelativePath)” 규칙을 따른다
 *
 * 구성:
 * 1) 경로 유틸
 * 2) 파일 선택/경로 매핑
 * 3) 트리 모델/구성
 * 4) DDL/중복 제거(dedupe)
 * 5) 선택 기반 타겟 계산/이동
 */

// =============================================================================
// 1) 경로 유틸
// =============================================================================

export function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}

export function splitPath(path: string): string[] {
  return normalizeSlashes(path)
    .split('/')
    .map(p => p.trim())
    .filter(Boolean)
}

/**
 * 업로드 파일의 "상대경로"를 프로젝트 루트 기준으로 정규화합니다.
 *
 * - 최상위 폴더는 항상 projectName 으로 고정
 * - Drag&Drop(FileSystemEntry) 또는 <input webkitdirectory>에서 온 webkitRelativePath를 우선 사용
 * - 단일 파일 업로드(상대경로 없음)도 projectName 아래로 강제 배치
 */
export function getNormalizedUploadPath(file: File, projectName: string): string {
  const raw = (file as any).webkitRelativePath || file.name
  const parts = splitPath(String(raw))

  const safeProject = (projectName || '').trim()
  if (!safeProject) return parts.join('/')

  if (parts.length >= 2) {
    parts[0] = safeProject
    return parts.join('/')
  }

  return [safeProject, parts[0] || file.name].join('/')
}

export function getNormalizedUploadPathWithoutProject(file: File, projectName: string): string {
  const full = getNormalizedUploadPath(file, projectName)
  const parts = splitPath(full)
  const safeProject = (projectName || '').trim()
  if (safeProject && parts[0] === safeProject) return parts.slice(1).join('/')
  return parts.join('/')
}

// =============================================================================
// 2) 파일 선택/경로 매핑
// =============================================================================

/**
 * 선택한 File[]에서 "공통 최상위 폴더"가 하나로 수렴하면 그 값을 반환합니다.
 * (자동 구조 인식은 이것만 수행)
 */
export function inferProjectNameFromPicked(picked: File[]): string {
  const firstParts = new Set<string>()
  for (const f of picked) {
    const raw = (f as any).webkitRelativePath || f.name
    const first = splitPath(String(raw))[0]
    if (first) firstParts.add(first)
  }
  return firstParts.size === 1 ? Array.from(firstParts)[0] : ''
}

export function forceWebkitRelativePath(file: File, relPath: string): File {
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: relPath,
      writable: false
    })
  } catch {
    // defineProperty가 막혀있는 경우가 있어도 file.name 기반으로라도 동작하도록 둠
  }
  return file
}

export function prefixPickedAsFolder(picked: File[], targetFolderRelPath: string): File[] {
  if (!targetFolderRelPath) return picked
  return picked.map((f) => {
    const raw = (f as any).webkitRelativePath || f.name
    const parts = splitPath(String(raw))
    const rest = parts.length >= 2 ? parts.slice(1).join('/') : parts[0] || f.name
    return forceWebkitRelativePath(f, `${targetFolderRelPath}/${rest}`)
  })
}

export function prefixPickedAsFiles(picked: File[], targetFolderRelPath: string): File[] {
  if (!targetFolderRelPath) return picked
  return picked.map((f) => forceWebkitRelativePath(f, `${targetFolderRelPath}/${f.name}`))
}

export type UploadPanelKind = 'file' | 'ddl'
export type UploadPickKind = 'folder' | 'file'

export function normalizeDdlTargetFolder(targetFolderRelPath: string): string {
  const target = targetFolderRelPath || 'ddl'
  return target.startsWith('ddl') ? target : `ddl/${target}`
}

/**
 * Picked 파일들을 panel/kind/targetFolder 규칙에 맞게 webkitRelativePath로 매핑합니다.
 * - ddl panel이면 무조건 ddl/ 아래로
 * - folder pick은 기존 하위 구조를 유지(최상위 폴더 제거 후 붙임)
 * - file pick은 파일명을 targetFolder 아래로 붙임
 */
export function mapPickedFilesToTarget(
  panel: UploadPanelKind,
  kind: UploadPickKind,
  picked: File[],
  targetFolderRelPath: string
): File[] {
  const target = panel === 'ddl' ? normalizeDdlTargetFolder(targetFolderRelPath) : targetFolderRelPath
  return kind === 'folder' ? prefixPickedAsFolder(picked, target) : prefixPickedAsFiles(picked, target)
}

// =============================================================================
// 3) 트리 모델/구성
// =============================================================================

export type UploadNodeType = 'folder' | 'file'

export interface UploadTreeNode {
  type: UploadNodeType
  name: string
  /** projectName 제외 상대경로 (파일: 전체 경로, 폴더: 해당 폴더 경로) */
  relPath: string
  children?: UploadTreeNode[]
  /** type === 'file' 일 때만 존재 */
  file?: File
}

/**
 * 업로드 파일들을 "프로젝트 루트 기준 상대경로"로 정규화하여 트리로 구성합니다.
 */
export function buildUploadTree(files: File[], projectName: string): UploadTreeNode {
  const safeProject = (projectName || '').trim()
  const root: UploadTreeNode = {
    type: 'folder',
    name: safeProject || '(project)',
    relPath: '',
    children: []
  }

  const sorted = [...files].sort((a, b) => {
    const pa = getNormalizedUploadPathWithoutProject(a, safeProject)
    const pb = getNormalizedUploadPathWithoutProject(b, safeProject)
    return pa.localeCompare(pb)
  })

  for (const file of sorted) {
    const rel = getNormalizedUploadPathWithoutProject(file, safeProject)
    const parts = splitPath(rel)
    if (parts.length === 0) continue

    let current = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLeaf = i === parts.length - 1

      const childRelPath = parts.slice(0, i + 1).join('/')
      if (!current.children) current.children = []

      let child = current.children.find(c => c.name === name && c.type === (isLeaf ? 'file' : 'folder'))
      if (!child) {
        child = {
          type: isLeaf ? 'file' : 'folder',
          name,
          relPath: childRelPath,
          ...(isLeaf ? { file } : { children: [] })
        }
        current.children.push(child)
      } else if (isLeaf) {
        child.file = file
      }

      if (!isLeaf) current = child
    }
  }

  const sortNode = (node: UploadTreeNode) => {
    if (!node.children) return
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortNode)
  }
  sortNode(root)

  return root
}

// =============================================================================
// 4) DDL / 중복 제거(dedupe)
// =============================================================================

/**
 * 사용자가 DDL 패널로 넣은 파일들의 경로 목록을 추출합니다.
 * - relPath가 'ddl/...' 형태인 파일만 대상
 * - 반환값은 'ddl/' prefix 제거된 경로
 */
export function getDdlPathsFromFiles(files: File[], projectName: string): string[] {
  const safeProject = (projectName || '').trim()
  const ddlPaths: string[] = []
  for (const file of files) {
    const rel = getNormalizedUploadPathWithoutProject(file, safeProject)
    const parts = splitPath(rel)
    if (parts.length === 0) continue
    if (parts[0]?.toLowerCase() !== 'ddl') continue
    const sub = parts.slice(1).join('/')
    if (!sub) continue
    ddlPaths.push(sub)
  }
  return Array.from(new Set(ddlPaths)).sort((a, b) => a.localeCompare(b))
}

/**
 * 파일 목록을 "정규화된 프로젝트 루트 기준 상대경로"로 고유화합니다.
 */
export function uniqueFilesByRelPath(files: File[], projectName: string): File[] {
  const safeProject = (projectName || '').trim()
  const seen = new Set<string>()
  const out: File[] = []
  for (const f of files) {
    const rel = getNormalizedUploadPathWithoutProject(f, safeProject)
    if (seen.has(rel)) continue
    seen.add(rel)
    out.push(f)
  }
  return out
}

// =============================================================================
// 5) 선택 기반 타겟 계산 / 이동
// =============================================================================

export function getParentFolderRelPath(relPath: string): string {
  const parts = splitPath(relPath)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

export function findNodeByRelPath(root: UploadTreeNode, relPath: string): UploadTreeNode | null {
  if (!relPath && root.relPath === '') return root
  const walk = (node: UploadTreeNode): UploadTreeNode | null => {
    if (node.relPath === relPath) return node
    for (const c of node.children || []) {
      const hit = walk(c)
      if (hit) return hit
    }
    return null
  }
  return walk(root)
}

/**
 * 현재 선택(selectedRelPath)을 기준으로 "추가 대상 폴더"를 계산합니다.
 * - 선택이 없으면: file 패널은 root(''), ddl 패널은 'ddl'
 * - 선택이 현재 패널 트리 밖이면: 위와 동일한 기본값
 * - 선택이 파일이면: 해당 파일의 부모 폴더
 * - 선택이 폴더면: 해당 폴더
 */
export function resolveSelectedTargetFolder(
  panel: UploadPanelKind,
  selectedRelPath: string | null,
  panelRoot: UploadTreeNode
): string {
  const sel = selectedRelPath || ''
  if (!sel) return panel === 'ddl' ? 'ddl' : ''

  const node = findNodeByRelPath(panelRoot, sel)
  if (!node) return panel === 'ddl' ? 'ddl' : ''
  if (node.type === 'folder') return node.relPath
  return getParentFolderRelPath(node.relPath)
}

/**
 * sourceRelPath(프로젝트 제외) 파일을 targetFolderRelPath로 이동시킨 새 relPath를 계산합니다.
 */
export function moveRelPathToFolder(sourceRelPath: string, targetFolderRelPath: string): string {
  const sourceParts = splitPath(sourceRelPath)
  const fileName = sourceParts[sourceParts.length - 1] || ''
  const targetParts = splitPath(targetFolderRelPath)
  const target = targetParts.length ? `${targetParts.join('/')}/${fileName}` : fileName
  return target
}



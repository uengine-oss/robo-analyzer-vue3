/**
 * OLAP API Service
 * data-platform-olap 백엔드와 통신하는 API 서비스 (fetch 기반)
 * API Gateway를 통해 연결됨
 */

// API Gateway URL - 모든 마이크로서비스 요청의 단일 진입점
const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? 'http://localhost:9000'
const OLAP_API_BASE = `${API_GATEWAY_URL}/olap/api`

async function fetchJson(url: string, options?: RequestInit) {
  const response = await fetch(`${OLAP_API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || response.statusText)
  }
  return response.json()
}

// Schema Management
export const uploadSchema = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${OLAP_API_BASE}/schema/upload`, {
    method: 'POST',
    body: formData
  })
  if (!response.ok) throw new Error('Upload failed')
  return response.json()
}

export const uploadSchemaText = async (xmlContent: string) => {
  return fetchJson('/schema/upload-text', {
    method: 'POST',
    body: JSON.stringify({ xml_content: xmlContent })
  })
}

// Cube Information
export const getCubes = async () => {
  return fetchJson('/cubes')
}

export const getCubeMetadata = async (cubeName: string) => {
  return fetchJson(`/cube/${encodeURIComponent(cubeName)}/metadata`)
}

export const getCubeSchemaDescription = async (cubeName: string) => {
  return fetchJson(`/cube/${encodeURIComponent(cubeName)}/schema-description`)
}

export const deleteCube = async (cubeName: string) => {
  return fetchJson(`/cube/${encodeURIComponent(cubeName)}`, {
    method: 'DELETE'
  })
}

export const deleteAllCubes = async () => {
  return fetchJson('/cubes', {
    method: 'DELETE'
  })
}

// Pivot Query
export const executePivotQuery = async (query: any) => {
  return fetchJson('/pivot/query', {
    method: 'POST',
    body: JSON.stringify(query)
  })
}

export const previewPivotSQL = async (query: any) => {
  return fetchJson('/pivot/preview-sql', {
    method: 'POST',
    body: JSON.stringify(query)
  })
}

// Natural Language Query
export const executeNL2SQL = async (question: string, cubeName: string | null = null) => {
  return fetchJson('/nl2sql', {
    method: 'POST',
    body: JSON.stringify({ question, cube_name: cubeName })
  })
}

// ETL APIs
export const getETLCatalog = async (schema: string = 'public') => {
  return fetchJson(`/etl/catalog?schema=${schema}`)
}

export const suggestETLStrategy = async (cubeDescription: string) => {
  return fetchJson('/etl/suggest', {
    method: 'POST',
    body: JSON.stringify({ cube_description: cubeDescription })
  })
}

export const createETLConfig = async (config: any) => {
  return fetchJson('/etl/config', {
    method: 'POST',
    body: JSON.stringify(config)
  })
}

export const getETLConfig = async (cubeName: string) => {
  return fetchJson(`/etl/config/${encodeURIComponent(cubeName)}`)
}

export const deleteETLConfig = async (cubeName: string) => {
  return fetchJson(`/etl/config/${encodeURIComponent(cubeName)}`, {
    method: 'DELETE'
  })
}

export const getETLConfigs = async () => {
  return fetchJson('/etl/configs')
}

export const deleteAllETLConfigs = async () => {
  return fetchJson('/etl/configs', {
    method: 'DELETE'
  })
}

export const executeETLSync = async (cubeName: string, forceFull: boolean = false) => {
  return fetchJson(`/etl/sync/${cubeName}`, {
    method: 'POST',
    body: JSON.stringify({ force_full: forceFull })
  })
}

export const generateDDL = async (schemaName: string, factTable: string, dimensions: any[]) => {
  return fetchJson('/etl/ddl', {
    method: 'POST',
    body: JSON.stringify({ schema_name: schemaName, fact_table: factTable, dimensions })
  })
}

// Health Check
export const healthCheck = async () => {
  return fetchJson('/health')
}

// ============== Airflow APIs ==============

export const deployETLPipeline = async (cubeName: string) => {
  return fetchJson(`/airflow/etl/${encodeURIComponent(cubeName)}/deploy`, {
    method: 'POST'
  })
}

export const runETLPipeline = async (cubeName: string) => {
  return fetchJson(`/airflow/etl/${encodeURIComponent(cubeName)}/run`, {
    method: 'POST'
  })
}

export const triggerDAG = async (dagId: string) => {
  return fetchJson(`/airflow/dag/${encodeURIComponent(dagId)}/trigger`, {
    method: 'POST'
  })
}

export const getDAGStatus = async (dagId: string) => {
  return fetchJson(`/airflow/dag/${encodeURIComponent(dagId)}/status`)
}

export const listDAGs = async () => {
  return fetchJson('/airflow/dags')
}

export const deleteDAG = async (dagId: string) => {
  return fetchJson(`/airflow/dag/${encodeURIComponent(dagId)}`, {
    method: 'DELETE'
  })
}

export const checkAirflowHealth = async () => {
  return fetchJson('/airflow/health')
}


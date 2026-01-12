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

// Create DW Schema
export const createDWSchema = async () => {
  return fetchJson('/etl/schema/create', {
    method: 'POST'
  })
}

// Generate Star Schema DDL
export const generateStarSchemaDDL = async (
  cubeName: string,
  factTableName: string,
  factColumns: any[],
  dimensions: any[],
  dwSchema: string = 'dw'
) => {
  return fetchJson('/etl/ddl/generate', {
    method: 'POST',
    body: JSON.stringify({
      cube_name: cubeName,
      fact_table_name: factTableName,
      fact_columns: factColumns,
      dimensions: dimensions,
      dw_schema: dwSchema
    })
  })
}

// Execute DDL
export const executeDDL = async (ddl: string) => {
  return fetchJson('/etl/ddl/execute', {
    method: 'POST',
    body: JSON.stringify({ ddl })
  })
}

// Full provisioning: create schema, tables, and initial data
export const provisionCube = async (
  cubeName: string, 
  aiSuggestion: any, 
  dimensions: any[], 
  measures: any[], 
  factTable: string,
  dwSchema: string = 'dw'
) => {
  return fetchJson('/etl/provision', {
    method: 'POST',
    body: JSON.stringify({
      cube_name: cubeName,
      fact_table: factTable,
      dimensions: dimensions.map((dim: any) => ({
        name: dim.name,
        table: dim.table,
        foreignKey: dim.foreignKey,
        levels: dim.levels || [],
        etlStrategy: dim.etlStrategy || 'etl',
        sourceTable: dim.sourceTable || null
      })),
      measures: measures.map((m: any) => ({
        name: m.name,
        column: m.column,
        aggregator: m.aggregator || 'sum'
      })),
      dw_schema: dwSchema,
      generate_sample_data: true
    })
  })
}

// Health Check
export const healthCheck = async () => {
  return fetchJson('/health')
}

// ============== Airflow APIs ==============

export const deployETLPipeline = async (cubeName: string, force: boolean = false) => {
  const params = force ? '?force=true' : ''
  return fetchJson(`/airflow/etl/${encodeURIComponent(cubeName)}/deploy${params}`, {
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

// ============== DW Tables Management ==============

export const listDWTables = async (schemaName: string = 'dw') => {
  return fetchJson(`/etl/dw/tables?schema_name=${schemaName}`)
}

export const deleteDWTables = async (tables: string[] = [], schemaName: string = 'dw') => {
  return fetchJson('/etl/dw/tables/delete', {
    method: 'POST',
    body: JSON.stringify({ tables, schema_name: schemaName })
  })
}

export const dropDWSchema = async (schemaName: string = 'dw') => {
  return fetchJson(`/etl/dw/schema?schema_name=${schemaName}`, {
    method: 'DELETE'
  })
}


<script setup lang="ts">
/**
 * FormattedResult.vue
 * LangChain 결과를 포맷팅하여 표시하는 컴포넌트
 * - SQL 쿼리: 문법 하이라이팅
 * - 테이블 데이터: HTML 테이블로 표시
 * - 일반 텍스트: 그대로 표시
 */
import { computed } from 'vue'
import { parseResultContent, tokenizeSql, parseToolInput, type ParsedContent } from '@/utils/resultFormatter'

const props = defineProps<{
  content: string
  type?: 'action' | 'result' | 'final'
  tool?: string
  input?: string
}>()

// 파싱된 콘텐츠
const parsedContent = computed<ParsedContent[]>(() => {
  return parseResultContent(props.content)
})

// Tool input 파싱
const parsedInput = computed(() => {
  if (!props.input) return null
  return parseToolInput(props.input)
})

// SQL 토큰화
function getSqlTokens(sql: string) {
  return tokenizeSql(sql)
}

// 숫자 포맷팅
function formatNumber(value: string): string {
  const num = parseFloat(value)
  if (!isNaN(num)) {
    // 큰 숫자는 천단위 구분
    if (Math.abs(num) >= 1000) {
      return num.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
    }
    return value
  }
  return value
}

// 값 타입 감지
function getValueType(value: string): string {
  if (!value || value === 'null' || value === 'NULL') return 'null'
  const num = parseFloat(value)
  if (!isNaN(num)) return 'number'
  if (value.match(/^\d{8,14}$/)) return 'datetime' // YYYYMMDD 등
  return 'text'
}

// SQL에서 도구 이름에 따른 아이콘
function getToolIcon(tool: string): string {
  const icons: Record<string, string> = {
    'execute_sql_preview': '🔍',
    'search_tables': '📋',
    'get_table_schema': '🏗️',
    'search_column_values': '📊',
    'explain': '💡',
  }
  return icons[tool] || '⚡'
}

// 복잡도 레벨 계산
function getComplexityLevel(score: number): string {
  if (score >= 50) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}
</script>

<template>
  <div class="formatted-result">
    <!-- Action 타입: 도구 호출 정보 표시 -->
    <template v-if="type === 'action' && tool">
      <div class="tool-header">
        <span class="tool-icon">{{ getToolIcon(tool) }}</span>
        <span class="tool-name">{{ tool }}</span>
      </div>
      
      <!-- Tool Input -->
      <div v-if="parsedInput" class="tool-input-section">
        <template v-if="typeof parsedInput === 'object'">
          <div v-for="(value, key) in parsedInput" :key="key" class="input-item">
            <span class="input-key">{{ key }}:</span>
            <template v-if="key === 'sql'">
              <div class="sql-block compact">
                <code class="sql-code">
                  <template v-for="(token, idx) in getSqlTokens(String(value))" :key="idx">
                    <span :class="'token-' + token.type">{{ token.value }}</span>
                  </template>
                </code>
              </div>
            </template>
            <template v-else>
              <span class="input-value">{{ value }}</span>
            </template>
          </div>
        </template>
        <template v-else>
          <pre class="raw-input">{{ parsedInput }}</pre>
        </template>
      </div>
    </template>
    
    <!-- Result/Final 타입: 파싱된 결과 표시 -->
    <template v-else>
      <div v-for="(item, idx) in parsedContent" :key="idx" class="content-block">
        <!-- SQL 블록 -->
        <template v-if="item.type === 'sql'">
          <div class="sql-block">
            <div class="sql-header">
              <span class="sql-icon">📝</span>
              <span>SQL Query</span>
              <button class="copy-btn" @click="navigator.clipboard.writeText(item.sql)" title="복사">
                📋
              </button>
            </div>
            <pre class="sql-code"><template v-for="(token, tidx) in getSqlTokens(item.sql)" :key="tidx"><span :class="'token-' + token.type">{{ token.value }}</span></template></pre>
          </div>
        </template>
        
        <!-- 테이블 블록 -->
        <template v-else-if="item.type === 'table'">
          <div class="table-block">
            <div class="table-header">
              <span class="table-icon">📊</span>
              <span>Query Results</span>
              <span class="row-count">{{ item.rowCount }} rows</span>
            </div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th class="row-num">#</th>
                    <th v-for="col in item.columns" :key="col">{{ col }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIdx) in item.rows" :key="rowIdx">
                    <td class="row-num">{{ rowIdx + 1 }}</td>
                    <td 
                      v-for="(cell, cellIdx) in row" 
                      :key="cellIdx"
                      :class="'cell-' + getValueType(cell)"
                    >
                      {{ getValueType(cell) === 'number' ? formatNumber(cell) : cell }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="item.rows.length < item.rowCount" class="more-rows">
              ... and {{ item.rowCount - item.rows.length }} more rows
            </div>
          </div>
        </template>
        
        <!-- 일반 텍스트 블록 -->
        <template v-else-if="item.type === 'text'">
          <div class="text-block">
            <pre>{{ item.content }}</pre>
          </div>
        </template>
        
        <!-- OLAP 최적화 제안 블록 -->
        <template v-else-if="item.type === 'olap'">
          <div class="olap-block">
            <div class="olap-header">
              <span class="olap-icon">📊</span>
              <span class="olap-title">OLAP 최적화 제안</span>
              <span class="complexity-badge" :class="getComplexityLevel(item.complexityScore)">
                복잡도: {{ item.complexityScore }}
              </span>
            </div>
            
            <div class="olap-content">
              <p class="olap-description">
                이 복잡한 쿼리는 Star Schema 기반 OLAP 큐브로 최적화하면 
                쿼리 성능을 크게 향상시킬 수 있습니다.
              </p>
              
              <div v-if="item.reasons && item.reasons.length > 0" class="complexity-reasons">
                <div class="reasons-title">감지된 복잡성 요인:</div>
                <ul>
                  <li v-for="(reason, rIdx) in item.reasons" :key="rIdx">{{ reason }}</li>
                </ul>
              </div>
              
              <a 
                v-if="item.frontendUrl" 
                :href="item.frontendUrl" 
                target="_blank" 
                class="olap-link"
              >
                <span class="link-icon">🔗</span>
                <span>OLAP 최적화 바로가기</span>
                <span class="external-icon">↗</span>
              </a>
            </div>
          </div>
        </template>
        
        <!-- 링크 블록 -->
        <template v-else-if="item.type === 'link'">
          <a :href="item.url" target="_blank" class="standalone-link">
            <span class="link-icon">🔗</span>
            <span>{{ item.text }}</span>
            <span class="external-icon">↗</span>
          </a>
        </template>
      </div>
      
      <!-- 파싱 실패시 원본 표시 -->
      <div v-if="parsedContent.length === 0" class="raw-content">
        <pre>{{ content }}</pre>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.formatted-result {
  font-size: 13px;
}

// Tool Header
.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  
  .tool-icon {
    font-size: 18px;
  }
  
  .tool-name {
    font-weight: 600;
    color: #10b981;
    font-size: 14px;
  }
}

// Tool Input Section
.tool-input-section {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  padding: 12px;
  
  .input-item {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    
    &:last-child {
      margin-bottom: 0;
    }
  }
  
  .input-key {
    color: var(--color-text-muted);
    font-weight: 500;
    min-width: 60px;
  }
  
  .input-value {
    color: var(--color-text);
    word-break: break-all;
  }
  
  .raw-input {
    margin: 0;
    white-space: pre-wrap;
    font-size: 12px;
  }
}

// Content blocks
.content-block {
  margin-bottom: 16px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

// SQL Block
.sql-block {
  background: #1e1e2e;
  border-radius: 8px;
  overflow: hidden;
  
  &.compact {
    background: transparent;
    
    .sql-code {
      padding: 0;
      background: transparent;
    }
  }
  
  .sql-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    
    .sql-icon {
      font-size: 14px;
    }
    
    span {
      font-weight: 500;
      color: #a6adc8;
      font-size: 12px;
    }
    
    .copy-btn {
      margin-left: auto;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 12px;
      opacity: 0.6;
      
      &:hover {
        opacity: 1;
      }
    }
  }
  
  .sql-code {
    display: block;
    padding: 12px 16px;
    margin: 0;
    overflow-x: auto;
    font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.6;
    color: #cdd6f4;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

// SQL Syntax Highlighting
.token-keyword {
  color: #cba6f7;
  font-weight: 600;
}

.token-string {
  color: #a6e3a1;
}

.token-number {
  color: #fab387;
}

.token-comment {
  color: #6c7086;
  font-style: italic;
}

.token-text {
  color: #cdd6f4;
}

// Table Block
.table-block {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  
  .table-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    
    .table-icon {
      font-size: 14px;
    }
    
    span {
      font-weight: 500;
      font-size: 13px;
    }
    
    .row-count {
      margin-left: auto;
      font-size: 11px;
      color: var(--color-text-muted);
      background: var(--color-bg-tertiary);
      padding: 2px 8px;
      border-radius: 10px;
    }
  }
  
  .table-wrapper {
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    
    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--color-border);
      white-space: nowrap;
    }
    
    th {
      background: var(--color-bg-secondary);
      font-weight: 600;
      color: var(--color-text-muted);
      position: sticky;
      top: 0;
      z-index: 1;
    }
    
    td {
      &.row-num {
        color: var(--color-text-muted);
        font-size: 10px;
        width: 30px;
        text-align: center;
      }
      
      &.cell-number {
        text-align: right;
        font-family: 'Fira Code', monospace;
        color: #fab387;
      }
      
      &.cell-null {
        color: var(--color-text-muted);
        font-style: italic;
      }
      
      &.cell-datetime {
        font-family: 'Fira Code', monospace;
        color: #89b4fa;
      }
    }
    
    tr:hover td {
      background: rgba(255, 255, 255, 0.03);
    }
    
    tr:last-child td {
      border-bottom: none;
    }
  }
  
  .more-rows {
    padding: 8px 14px;
    font-size: 11px;
    color: var(--color-text-muted);
    text-align: center;
    background: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border);
  }
}

// Text Block
.text-block {
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
    color: var(--color-text);
  }
}

// Raw Content fallback
.raw-content {
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.6;
  }
}

// OLAP 최적화 제안 블록
.olap-block {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 12px;
  overflow: hidden;
  
  .olap-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: rgba(139, 92, 246, 0.1);
    border-bottom: 1px solid rgba(139, 92, 246, 0.2);
    
    .olap-icon {
      font-size: 20px;
    }
    
    .olap-title {
      font-weight: 600;
      font-size: 14px;
      color: #a78bfa;
    }
    
    .complexity-badge {
      margin-left: auto;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      
      &.high {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
      }
      
      &.medium {
        background: rgba(251, 191, 36, 0.2);
        color: #fbbf24;
      }
      
      &.low {
        background: rgba(52, 211, 153, 0.2);
        color: #34d399;
      }
    }
  }
  
  .olap-content {
    padding: 16px;
    
    .olap-description {
      margin: 0 0 12px;
      color: var(--color-text);
      line-height: 1.6;
      font-size: 13px;
    }
    
    .complexity-reasons {
      margin-bottom: 16px;
      
      .reasons-title {
        font-weight: 500;
        margin-bottom: 8px;
        color: var(--color-text-muted);
        font-size: 12px;
      }
      
      ul {
        margin: 0;
        padding-left: 20px;
        
        li {
          margin-bottom: 4px;
          font-size: 12px;
          color: var(--color-text);
        }
      }
    }
    
    .olap-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      font-size: 13px;
      transition: all 0.2s ease;
      
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
      }
      
      .link-icon {
        font-size: 14px;
      }
      
      .external-icon {
        font-size: 12px;
        opacity: 0.8;
      }
    }
  }
}

// 독립 링크
.standalone-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: white;
  text-decoration: none;
  border-radius: 8px;
  font-weight: 500;
  font-size: 13px;
  transition: all 0.2s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
  }
  
  .link-icon {
    font-size: 14px;
  }
  
  .external-icon {
    font-size: 12px;
    opacity: 0.8;
  }
}
</style>


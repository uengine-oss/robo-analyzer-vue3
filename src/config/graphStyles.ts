/**
 * graphStyles.ts
 * Neo4j Graph 스타일 설정
 * 
 * 노드 및 관계의 색상, 크기 등 시각적 스타일 정의
 * 
 * NOTE: 추후 노드/관계 스타일을 사용자가 커스터마이징할 수 있는
 * UI를 제공할 예정이며, 해당 설정은 로컬 스토리지에 캐싱됩니다.
 */

// ============================================================================
// 노드 색상 설정
// ============================================================================

/**
 * 노드 타입별 색상
 * Neo4j Browser 스타일 참고 - 차분한 톤
 */
export const NODE_COLORS: Record<string, string> = {
  // 시스템/파일 구조
  SYSTEM: '#4A82CA',
  FILE: '#50B5D3',
  
  // SQL 문 타입
  SELECT: '#EB8A5A',
  INSERT: '#7AC288',
  UPDATE: '#E0A7B8',
  DELETE: '#F0B448',
  MERGE: '#CF6888',
  
  // 프로시저/함수
  PROCEDURE: '#B888B0',
  FUNCTION: '#8E50AC',
  
  // 제어문
  IF: '#4E8775',
  ELSE: '#4E8775',
  ELSEIF: '#4E8775',
  CASE: '#4E8775',
  WHEN: '#4E8775',
  
  // 반복문
  WHILE: '#CFBEA0',
  LOOP: '#CFBEA0',
  FOR: '#CFBEA0',
  
  // 변수/선언
  DECLARE: '#62C290',
  Variable: '#98A0A8',
  
  // 테이블/컬럼
  Table: '#E35A5C',
  Column: '#F088A2',
  CREATE_TEMP_TABLE: '#E88400',
  
  // 클래스/인터페이스 (Java/Python)
  CLASS: '#3B82F6',
  Class: '#3B82F6',
  INTERFACE: '#8B5CF6',
  Interface: '#8B5CF6',
  METHOD: '#10B981',
  Method: '#10B981',
  
  // 기타 SQL
  DBLink: '#7D4A15',
  CURSOR: '#1DA6A0',
  EXCEPTION: '#D02038',
  EXECUTE: '#3A60D2',
  OPEN: '#2DB82D',
  CLOSE: '#F05840',
  FETCH: '#8668CD',
  RETURN: '#2A8050',
  RAISE: '#A82020',
  
  // 추가 노드 타입
  BEGIN: '#4A82CA',
  CONTINUE: '#62C290',
  NOTICE: '#F0B448',
  ASSIGNMENT: '#7090CC',
  SPEC: '#98A0A8',
  
  // 기본값
  DEFAULT: '#5AA0E0'
}

// ============================================================================
// 관계 색상 설정
// ============================================================================

/**
 * 관계 타입별 색상
 */
export const RELATIONSHIP_COLORS: Record<string, string> = {
  CONTAINS: '#9CA3AB',
  PARENT_OF: '#9CA3AB',
  NEXT: '#9CA3AB',
  CALL: '#9CA3AB',
  FROM: '#9CA3AB',
  WRITES: '#9CA3AB',
  HAS_COLUMN: '#9CA3AB',
  DB_LINK: '#9CA3AB',
  FK_TO_TABLE: '#9CA3AB',
  FK_TO: '#9CA3AB',
  SCOPE: '#9CA3AB',
  EXTENDS: '#9CA3AB',
  IMPLEMENTS: '#9CA3AB',
  DEFAULT: '#9CA3AB'
}

// ============================================================================
// 노드 크기 설정
// ============================================================================

/**
 * 노드 타입별 크기
 */
export const NODE_SIZES: Record<string, number> = {
  SYSTEM: 45,
  FILE: 35,
  PROCEDURE: 40,
  FUNCTION: 40,
  Table: 38,
  CLASS: 40,
  Class: 40,
  INTERFACE: 38,
  Interface: 38,
  DEFAULT: 30
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 노드 라벨에 따른 색상 반환
 * Table 라벨이 있으면 우선적으로 Table 색상 반환
 */
export function getNodeColor(labels: string[]): string {
  // Table 우선 처리
  if (labels.includes('Table')) {
    return NODE_COLORS.Table
  }
  
  // 라벨 순회하며 색상 찾기
  for (const label of labels) {
    if (NODE_COLORS[label]) {
      return NODE_COLORS[label]
    }
    
    const upperLabel = label.toUpperCase()
    if (NODE_COLORS[upperLabel]) {
      return NODE_COLORS[upperLabel]
    }
  }
  
  return NODE_COLORS.DEFAULT
}

/**
 * 관계 타입에 따른 색상 반환
 */
export function getRelationshipColor(type: string): string {
  return RELATIONSHIP_COLORS[type] || RELATIONSHIP_COLORS.DEFAULT
}

/**
 * 노드 라벨에 따른 크기 반환
 */
export function getNodeSize(labels: string[]): number {
  for (const label of labels) {
    if (NODE_SIZES[label]) {
      return NODE_SIZES[label]
    }
  }
  return NODE_SIZES.DEFAULT
}

# 프론트엔드용 백엔드 API 스펙

## 개요

이 문서는 Legacy Modernizer 프론트엔드 구현을 위한 백엔드 API 스펙입니다.

---

## 서버 정보

| 서버 | URL | 용도 |
|---|---|---|
| ANTLR Server | `http://localhost:8081` | 파일 업로드, ANTLR 파싱 |
| Backend Server | `http://localhost:5502` | Understanding, Converting |

---

## 공통

### 헤더

| 헤더 | 필수 | 설명 |
|---|---|---|
| `Session-UUID` | ✅ | 세션 고유 식별자 (프론트에서 생성) |
| `OpenAI-Api-Key` | ⚠️ | API 키 (테스트 세션 제외) |
| `Accept-Language` | ❌ | 로케일 (기본: `ko`) |

### 스트리밍 응답 형식 (NDJSON 표준)

```
{"type":"message","content":"Processing..."}\n
{"type":"data","file_type":"entity","code":"..."}\n
{"type":"complete"}\n
```

**NDJSON (Newline Delimited JSON)** 표준 사용:
- 각 JSON 객체가 `\n`으로 구분됨
- JSON 내부 줄바꿈은 자동 이스케이프 (`\\n`)
- 표준 라이브러리로 파싱 가능

**이벤트 타입:**

| type | 설명 | 예시 |
|---|---|---|
| `message` | 진행 상태 메시지 | `{"type":"message","content":"Processing..."}` |
| `data` | 결과 데이터 | `{"type":"data","file_type":"entity","code":"..."}` |
| `status` | 단계 진행 상태 | `{"type":"status","step":1,"done":true}` |
| `complete` | 스트림 정상 완료 | `{"type":"complete"}` |
| `error` | 에러 발생 | `{"type":"error","content":"...","errorType":"...","traceId":"..."}` |

---

## 핵심 파라미터

| 필드 | 값 | 설명 |
|---|---|---|
| strategy | `dbms` \| `framework` \| `architecture` | 전략 타입 |
| target | `oracle` \| `postgresql` \| `java` \| `python` \| `mermaid` | 타겟 |

### 전략별 타겟 조합

| strategy | target | 용도 |
|---|---|---|
| `dbms` | `oracle` | PostgreSQL → Oracle 변환 |
| `dbms` | `postgresql` | Oracle → PostgreSQL 변환 |
| `framework` | `java` | Spring Boot 프로젝트 생성 |
| `framework` | `python` | FastAPI 프로젝트 생성 (예정) |
| `architecture` | `mermaid` | Mermaid 클래스 다이어그램 생성 |

---

# ANTLR Server API (파일 업로드/파싱)

## 1. 파일 업로드

파일을 업로드하고 서버에 저장합니다.

```
POST http://localhost:8081/fileUpload
Content-Type: multipart/form-data
```

### Request

| 파트 | 타입 | 설명 |
|---|---|---|
| `metadata` | JSON string | 프로젝트 메타데이터 |
| `files` | File[] | 업로드할 파일들 |

**metadata 구조:**

```json
{
  "strategy": "framework",
  "target": "java",
  "projectName": "MyProject",
  "ddl": ["schema.sql", "tables/order.sql"]
}
```

### 🔄 자동 구조 인식 (프론트 로직)

업로드된 파일의 디렉토리 구조를 분석하여 자동 배치:

```
MyProject/              → projectName: "MyProject"
├── ddl/
│   └── schema.sql      → ddl: ["schema.sql"]
├── user/
│   ├── UserService.java
│   └── UserController.java   → systems[0]: {name: "user", sp: [...]}
└── order/
    └── OrderService.java     → systems[1]: {name: "order", sp: [...]}
```

**자동 인식 규칙(최소화):**
1. 최상위 폴더명 → `projectName` (고정)
2. 나머지 분류(DDL/일반 파일)는 프론트에서 **사용자가 DDL 패널로 배치**한 결과만 반영합니다.

### 📦 multipart/form-data에서 경로 전달 방식(변경)

`files` 파트의 **filename(파일명)** 자리에, 실제 파일명 대신 **`projectName`을 포함한 상대경로**를 넣어 전송합니다.

예:
- `files`: `MyProject/user/controller/UserController.java`
- `files`: `MyProject/ddl/tables/order.sql`
- `files`: `MyProject/readme.txt`

> 백엔드는 이 filename 값을 사용해 업로드 폴더 구조를 그대로 저장/복원할 수 있습니다.

### Response

**성공 (200):**
```json
{
  "projectName": "MyProject",
  "files": [
    {"fileName": "user/UserService.java", "fileContent": "..."}
  ],
  "ddlFiles": [
    {"fileName": "schema.sql", "fileContent": "CREATE TABLE..."}
  ]
}
```

---

## 2. ANTLR 파싱

업로드된 파일을 ANTLR로 파싱하여 AST를 생성합니다.

```
POST http://localhost:8081/parsing
Content-Type: application/json
```

### Request

```json
{
  "strategy": "framework",
  "target": "java",
  "projectName": "MyProject",
  "systems": [
    {"name": "user", "sp": ["UserService.java"]}
  ]
}
```

### Response

```json
{
  "projectName": "MyProject",
  "files": [
    {
      "system": "user",
      "fileName": "UserService.java",
      "analysisResult": "{...AST JSON...}"
    }
  ]
}
```

---

# Backend Server API (Understanding/Converting)

## 3. Understanding (그래프 생성)

ANTLR 파싱 결과를 분석하여 Neo4j 그래프를 생성합니다.

```
POST http://localhost:5502/cypherQuery/
Content-Type: application/json
```

### Request

```json
{
  "strategy": "framework",
  "target": "java",
  "projectName": "MyProject",
  "systems": [
    {"name": "user", "sp": ["UserService.java"]}
  ]
}
```

### Response (Streaming)

```json
{"type": "message", "content": "Preparing Analysis Data"}
{"type": "data", "graph": {...D3용 그래프 데이터...}, "analysis_progress": 100}
{"type": "message", "content": "Analysis completed"}
```

**graph 구조 (D3용):**
```json
{
  "nodes": [
    {"id": "UserService", "label": "CLASS", "properties": {...}}
  ],
  "links": [
    {"source": "UserService", "target": "UserRepository", "type": "USES"}
  ]
}
```

---

## 4. Converting (코드 변환)

분석된 그래프를 기반으로 코드를 변환/생성합니다.

```
POST http://localhost:5502/convert/
Content-Type: application/json
```

### 4-1. Framework 전략 (Spring Boot 생성)

```json
{
  "strategy": "framework",
  "target": "java",
  "projectName": "MyProject",
  "systems": [
    {"name": "user", "sp": ["UserService.java"]}
  ]
}
```

**Response (Streaming):**
```json
{"type": "data", "file_type": "entity_class", "file_name": "User.java", "code": "..."}
{"type": "data", "file_type": "repository_class", "file_name": "UserRepository.java", "code": "..."}
{"type": "data", "file_type": "service_class", "file_name": "UserService.java", "code": "..."}
{"type": "status", "step": 4, "done": true}
```

### 4-2. DBMS 전략 (DB 변환)

```json
{
  "strategy": "dbms",
  "target": "oracle",
  "projectName": "MyProject",
  "systems": [
    {"name": "proc", "sp": ["get_user.sql"]}
  ]
}
```

**Response (Streaming):**
```json
{"type": "data", "file_type": "converted_sp", "file_name": "get_user.sql", "code": "...Oracle PL/SQL..."}
```

### 4-3. Architecture 전략 (클래스 다이어그램) ⭐

```json
{
  "strategy": "architecture",
  "target": "mermaid",
  "projectName": "MyProject",
  "classNames": ["user/UserService", "order/OrderController"]
}
```

**classNames 형식:** `"systemName/className"`
- 동일한 클래스명이 여러 시스템에 존재할 수 있으므로 시스템으로 구분
- 예: `user/UserService`, `admin/UserService`

**Response (Streaming NDJSON):**
```json
{"type": "message", "content": "클래스 다이어그램 생성 시작: 2개 클래스"}
{"type": "message", "content": "조회 완료: 5개 클래스, 3개 관계"}
{"type": "data", "file_type": "mermaid_diagram", "diagram": "```mermaid\nclassDiagram\n...", "class_count": 5, "relationship_count": 3}
{"type": "message", "content": "클래스 다이어그램 생성 완료"}
{"type": "complete", "content": "Processing complete."}
```

---

## 5. 클래스 검색 (프론트 그래프 필터링)

**API가 아닌 프론트엔드에서 처리**

Understanding 결과 그래프 데이터에서 클래스 검색을 수행합니다.

### 그래프 데이터 구조

```typescript
interface ClassNode {
  class_name: string;       // 클래스명
  folder_name: string;      // 시스템명 (예: "user", "order")
  file_name: string;        // 파일명 (예: "UserService.java")
  type: "CLASS" | "INTERFACE";
}
```

### 검색 로직 (프론트에서 구현)

```typescript
function searchClasses(graph: GraphData, keyword: string): ClassNode[] {
  return graph.nodes
    .filter(n => (n.type === 'CLASS' || n.type === 'INTERFACE'))
    .filter(n => n.class_name.toLowerCase().includes(keyword.toLowerCase()));
}

// 선택된 클래스를 API 형식으로 변환
function toClassNames(nodes: ClassNode[]): string[] {
  return nodes.map(n => `${n.folder_name}/${n.class_name}`);
}
```

### 동일 클래스명 구분

| 시스템 | 클래스명 | classNames 형식 |
|---|---|---|
| user | UserService | `user/UserService` |
| admin | UserService | `admin/UserService` |

---

## 6. 다이어그램 확장

기존 다이어그램에서 특정 클래스를 확장합니다.

```
POST http://localhost:5502/convert/
Content-Type: application/json
```

### Request

```json
{
  "strategy": "architecture",
  "target": "mermaid",
  "projectName": "MyProject",
  "classNames": ["user/UserService", "user/UserRepository", "order/OrderService"]
}
```

**확장 방법:** `classNames`에 기존 클래스 + 확장할 클래스를 모두 포함하면 됩니다.

**형식:** `"systemName/className"`

---

## 7. ZIP 다운로드

생성된 Spring Boot 프로젝트를 ZIP으로 다운로드합니다.

```
POST http://localhost:5502/downloadJava/
Content-Type: application/json
```

### Request

```json
{
  "projectName": "MyProject"
}
```

### Response

`application/octet-stream` - ZIP 파일 바이너리

---

## 8. 데이터 삭제

세션의 모든 데이터를 삭제합니다.

```
DELETE http://localhost:5502/deleteAll/
```

### Response

```json
{
  "message": "모든 임시 파일이 삭제되었습니다."
}
```

---

# 프론트엔드 구현 가이드

## 파일 업로드 모달 플로우

```
1. 파일 드래그/선택
       ↓
2. 디렉토리 구조 분석 → 자동 배치
       ↓
3. 모달 표시:
   - projectName (수정 가능)
   - systems[] (드래그로 재배치)
   - ddl[] (드래그로 재배치)
   - 추가 업로드 버튼
       ↓
4. 확인 → POST /fileUpload
```

## D3 그래프 vs Mermaid 다이어그램

| 뷰 | 데이터 소스 | 용도 |
|---|---|---|
| D3 그래프 | `/cypherQuery/` 응답의 `graph` | 전체 구조 탐색 (Neo4j 스타일) |
| Mermaid | `/convert/` (architecture) | 선택한 클래스 UML 다이어그램 |

## 클래스 다이어그램 검색/확장 플로우

```
1. 검색창에 클래스명 입력
       ↓
2. 그래프 데이터에서 필터링 → 후보 목록 표시 (프론트에서 처리)
       ↓
3. 특정 클래스 선택 (systemName/className 형식)
       ↓
4. POST /convert/ (architecture) → Mermaid 생성
       ↓
5. 다이어그램 표시
       ↓
6. 클래스 클릭 → 확장 버튼
       ↓
7. 확장 클릭 → classNames에 추가 → 재요청
       ↓
8. 업데이트된 다이어그램 표시
```

## 성능 고려사항

### 확장/축소 캐싱

```javascript
// 프론트 캐시 구조 예시
const diagramCache = {
  "user/UserService": { 
    diagram: "...", 
    classNames: ["user/UserService", "user/UserRepository"] 
  }
};

// 축소 시: 캐시된 이전 상태로 복원
// 확장 시: 캐시 확인 → 없으면 요청
```

> 📌 1단계 깊이로 연결된 클래스는 모두 표시합니다.

---

# 스트리밍 구현 가이드

## NDJSON 파싱 (프론트엔드)

```javascript
/**
 * NDJSON 스트림 파싱 유틸리티
 * @param {string} url - API 엔드포인트
 * @param {object} body - 요청 바디
 * @param {function} onEvent - 이벤트 콜백 (type, data) => void
 */
async function streamFetch(url, body, onEvent) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Session-UUID': sessionId,
            'OpenAI-Api-Key': apiKey,
        },
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            // 줄바꿈으로 분리
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 마지막은 불완전할 수 있음
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                try {
                    const event = JSON.parse(line);
                    onEvent(event.type, event);
                    
                    // 완료 또는 에러 시 종료
                    if (event.type === 'complete' || event.type === 'error') {
                        return event;
                    }
                } catch (e) {
                    console.warn('JSON 파싱 실패:', line);
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// 사용 예시
await streamFetch('/convert/', {
    strategy: 'architecture',
    target: 'mermaid',
    projectName: 'MyProject',
    classNames: ['user/UserService', 'order/OrderController']
}, (type, event) => {
    switch (type) {
        case 'message':
            console.log('진행:', event.content);
            break;
        case 'data':
            console.log('데이터:', event);
            break;
        case 'status':
            updateProgress(event.step, event.done);
            break;
        case 'complete':
            console.log('완료!');
            break;
        case 'error':
            console.error('에러:', event.content, event.traceId);
            break;
    }
});
```

## 에러 처리

### 에러 이벤트 구조

```json
{
    "type": "error",
    "content": "ValueError: 잘못된 입력",
    "errorType": "ValueError",
    "traceId": "stream-a1b2c3d4"
}
```

### 에러 종류

| 상황 | 처리 |
|---|---|
| HTTP 4xx/5xx | `response.ok` 체크 |
| 스트림 중 예외 | `type: "error"` 이벤트 |
| 연결 끊김 | `reader.read()` 에러 |
| JSON 파싱 실패 | try-catch로 무시 |

### 재시도 로직 (선택)

```javascript
async function streamFetchWithRetry(url, body, onEvent, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await streamFetch(url, body, onEvent);
        } catch (e) {
            if (i === maxRetries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1))); // 백오프
        }
    }
}
```

---

# 에러 코드

| HTTP | 에러 | 원인 |
|---|---|---|
| 400 | projectName이 없습니다 | projectName 누락 |
| 400 | architecture 전략은 classNames가 필요합니다 | classNames 누락 |
| 400 | 잘못된 classNames 형식: 'xxx' | `systemName/className` 형식 아님 |
| 401 | API 키 검증 실패 | 잘못된 API 키 |
| 500 | 내부 서버 오류 | 서버 에러 (traceId 확인) |

---

# 버전

| 버전 | 날짜 | 변경 사항 |
|---|---|---|
| 1.0 | 2025-12-15 | 초안 작성 |


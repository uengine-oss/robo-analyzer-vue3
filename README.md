# Robo Analyzer Frontend

레거시 코드를 현대적인 프레임워크로 변환하는 도구의 프론트엔드 애플리케이션입니다.

## 📋 목차

- [프로젝트 개요](#프로젝트-개요)
- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [프로젝트 구조](#프로젝트-구조)
- [시작하기](#시작하기)
- [개발 가이드](#개발-가이드)
- [주요 기능 상세](#주요-기능-상세)
- [상태 관리](#상태-관리)
- [API 구조](#api-구조)
- [컴포넌트 가이드](#컴포넌트-가이드)
- [트러블슈팅](#트러블슈팅)
- [기여 가이드](#기여-가이드)

---

## 🎯 프로젝트 개요

Robo Analyzer는 레거시 코드(Java, Python, Oracle, PostgreSQL)를 분석하고, 현대적인 프레임워크(Spring Boot, FastAPI)로 변환하는 도구입니다.

### 핵심 워크플로우

```
파일 업로드 → ANTLR 파싱 → Understanding (그래프 생성) → Convert (코드 변환)
```

1. **업로드**: 프로젝트 폴더를 드래그 앤 드롭으로 업로드
2. **파싱**: ANTLR을 사용하여 소스 코드를 AST로 변환
3. **Understanding**: Neo4j 그래프 데이터베이스에 코드 구조 저장 및 시각화
4. **Convert**: AI 기반 코드 변환으로 타겟 프레임워크 코드 생성

---

## ✨ 주요 기능

### 1. 파일 업로드 및 관리
- 드래그 앤 드롭 파일 업로드
- 디렉토리 구조 자동 인식
- 파일 트리 뷰어
- 소스 타입 자동 감지 (Java, Python, SQL)

### 2. 그래프 시각화
- **Graph 뷰**: Neo4j 기반 대화형 그래프 (NVL 라이브러리)
- **UML 뷰**: VueFlow 기반 클래스 다이어그램 (ELK 레이아웃)
- 노드 검색 및 필터링
- 노드 상세 정보 패널
- 노드 스타일 커스터마이징

### 3. 코드 변환
- 실시간 스트리밍 변환 진행 상황
- 변환된 파일 목록 및 코드 미리보기
- Monaco Editor 기반 코드 뷰어
- ZIP 다운로드

### 4. 스트리밍 처리
- NDJSON 형식의 실시간 데이터 수신
- 점진적 그래프 업데이트
- 진행 상황 실시간 표시

---

## 🛠 기술 스택

### 핵심 프레임워크
- **Vue 3** (Composition API) - UI 프레임워크
- **TypeScript** - 타입 안정성
- **Vite** - 빌드 도구 및 개발 서버

### 상태 관리
- **Pinia** - 상태 관리 라이브러리

### 그래프 시각화
- **@neo4j-nvl/base** - Neo4j 그래프 렌더링
- **@vue-flow/core** - UML 다이어그램 렌더링
- **elkjs** - UML 레이아웃 알고리즘

### 기타 라이브러리
- **Monaco Editor** - 코드 에디터
- **Vue Router** - 라우팅
- **Sass** - CSS 전처리기
- **uuid** - 고유 ID 생성

---

## 📁 프로젝트 구조

```
frontend_new/
├── src/
│   ├── components/          # Vue 컴포넌트
│   │   ├── common/         # 공통 컴포넌트
│   │   │   ├── TopToolbar.vue      # 상단 툴바
│   │   │   ├── TabContainer.vue    # 탭 컨테이너
│   │   │   └── SettingsModal.vue   # 설정 모달
│   │   ├── upload/        # 업로드 탭 컴포넌트
│   │   │   ├── UploadTab.vue       # 메인 업로드 탭
│   │   │   ├── DropZone.vue        # 드롭존
│   │   │   ├── UploadModal.vue     # 업로드 모달
│   │   │   ├── UploadTree.vue      # 파일 트리
│   │   │   └── JsonViewer.vue      # JSON 뷰어
│   │   ├── graph/         # 그래프 탭 컴포넌트
│   │   │   ├── GraphTab.vue              # 메인 그래프 탭
│   │   │   ├── NvlGraph.vue              # Neo4j 그래프
│   │   │   ├── VueFlowClassDiagram.vue    # UML 다이어그램
│   │   │   ├── NodeDetailPanel.vue       # 노드 상세 패널
│   │   │   ├── NodeStylePanel.vue        # 노드 스타일 패널
│   │   │   └── ElkEdge.vue               # ELK 엣지 컴포넌트
│   │   └── convert/       # 전환 탭 컴포넌트
│   │       ├── ConvertTab.vue      # 메인 전환 탭
│   │       ├── CodeEditor.vue      # 코드 에디터
│   │       ├── FrameworkSteps.vue # 프레임워크 단계
│   │       └── StreamingLog.vue    # 스트리밍 로그
│   ├── stores/            # Pinia 스토어
│   │   ├── project.ts     # 프로젝트 상태 관리
│   │   └── session.ts     # 세션 관리
│   ├── services/          # API 서비스
│   │   └── api.ts         # API 클라이언트
│   ├── utils/             # 유틸리티 함수
│   │   ├── classDiagram.ts    # UML 다이어그램 유틸
│   │   ├── upload.ts          # 업로드 유틸
│   │   └── nodeStyleStorage.ts # 노드 스타일 저장
│   ├── types/             # TypeScript 타입 정의
│   │   └── index.ts       # 전역 타입
│   ├── styles/            # 전역 스타일
│   │   └── main.scss     # 메인 스타일
│   ├── layouts/           # 레이아웃 컴포넌트
│   │   └── MainLayout.vue # 메인 레이아웃
│   ├── views/             # 페이지 뷰
│   │   └── HomeView.vue   # 홈 뷰
│   ├── router/            # 라우터 설정
│   │   └── index.ts       # 라우터 정의
│   ├── composables/       # Composable 함수
│   │   └── useResize.ts  # 리사이즈 훅
│   ├── config/            # 설정 파일
│   │   └── graphStyles.ts # 그래프 스타일 설정
│   └── main.ts            # 애플리케이션 진입점
├── public/                # 정적 파일
├── package.json           # 의존성 및 스크립트
├── vite.config.ts        # Vite 설정
├── tsconfig.json         # TypeScript 설정
└── README.md             # 프로젝트 문서
```

---

## 🚀 시작하기

### 필수 요구사항

- **Node.js** 18.x 이상
- **npm** 또는 **yarn**
- **ANTLR Server** (포트 8081)
- **Backend Server** (포트 5502)

### 설치

```bash
# 의존성 설치
npm install

# 또는
yarn install
```

### 개발 서버 실행

```bash
# 개발 서버 시작 (포트 3000)
npm run dev

# 또는
yarn dev
```

브라우저에서 `http://localhost:3000` 접속

### 빌드

```bash
# 프로덕션 빌드
npm run build

# 빌드 미리보기
npm run preview

# 타입 체크
npm run type-check
```

### 서버 설정

프로젝트는 Vite 프록시를 통해 백엔드 서버와 통신합니다:

- **ANTLR Server**: `http://127.0.0.1:8081` → `/antlr`
- **Backend Server**: `http://127.0.0.1:5502` → `/backend`

포트 변경은 `vite.config.ts`에서 수정할 수 있습니다.

---

## 💻 개발 가이드

### 코드 스타일

- **Vue 3 Composition API** 사용
- **TypeScript** 엄격 모드 (`strict: true`)
- **SCSS** 스타일링
- **ESLint** 및 **Prettier** 권장 (설정 파일 추가 필요)

### 파일 네이밍

- 컴포넌트: `PascalCase.vue` (예: `UploadTab.vue`)
- 유틸리티: `camelCase.ts` (예: `classDiagram.ts`)
- 타입: `PascalCase` 인터페이스 (예: `GraphNode`)

### 경로 별칭

프로젝트는 `@` 별칭을 사용합니다:

```typescript
import { useProjectStore } from '@/stores/project'
import UploadTab from '@/components/upload/UploadTab.vue'
```

### 상태 관리 패턴

Pinia 스토어는 Composition API 스타일로 작성됩니다:

```typescript
export const useProjectStore = defineStore('project', () => {
  // 상태
  const projectName = ref('')
  
  // Computed
  const isValidConfig = computed(() => ...)
  
  // Actions
  function setProjectName(name: string) {
    projectName.value = name
  }
  
  return { projectName, isValidConfig, setProjectName }
})
```

### 컴포넌트 구조

표준 Vue 3 컴포넌트 구조:

```vue
<script setup lang="ts">
// 1. Imports
import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/project'

// 2. Props & Emits
const props = defineProps<{ ... }>()
const emit = defineEmits<{ ... }>()

// 3. Stores
const projectStore = useProjectStore()

// 4. State
const localState = ref(...)

// 5. Computed
const computedValue = computed(() => ...)

// 6. Methods
function handleAction() { ... }

// 7. Lifecycle
onMounted(() => { ... })
</script>

<template>
  <!-- 템플릿 -->
</template>

<style lang="scss" scoped>
/* 스타일 */
</style>
```

---

## 📖 주요 기능 상세

### 1. 파일 업로드

**컴포넌트**: `UploadTab.vue`, `DropZone.vue`, `UploadModal.vue`

**흐름**:
1. 사용자가 파일을 드래그 앤 드롭 또는 클릭으로 선택
2. `UploadModal`에서 프로젝트명 설정 및 파일 확인
3. `projectStore.uploadFiles()` 호출
4. `antlrApi.uploadFiles()`로 서버에 파일 업로드
5. 업로드된 파일 목록을 트리 구조로 표시

**주요 함수**:
- `handleFilesDrop()`: 파일 드롭 처리
- `analyzeFileStructure()`: 디렉토리 구조 분석
- `detectSourceType()`: 파일 확장자로 소스 타입 감지

### 2. 그래프 시각화

#### Graph 뷰 (NVL)

**컴포넌트**: `NvlGraph.vue`

- Neo4j 그래프를 대화형으로 시각화
- 노드 클릭/더블클릭으로 상세 정보 표시
- 줌, 팬, 드래그 지원
- 노드 제한 설정 (기본 500개)

#### UML 뷰 (VueFlow)

**컴포넌트**: `VueFlowClassDiagram.vue`

- ELK 레이아웃 알고리즘으로 UML 다이어그램 생성
- 클래스 검색 및 선택
- 깊이 기반 관계 탐색 (기본 3단계)
- 클라이언트 사이드 렌더링 (서버 API 호출 없음)

**주요 함수**:
- `buildClassDiagramData()`: 그래프 데이터를 UML 형식으로 변환
- `layoutWithElk()`: ELK 레이아웃 계산
- `buildDiagram()`: 다이어그램 생성

### 3. 코드 변환

**컴포넌트**: `ConvertTab.vue`, `CodeEditor.vue`

**흐름**:
1. `projectStore.runConvert()` 호출
2. NDJSON 스트림으로 변환된 파일 수신
3. `projectStore.updateConvertedFile()`로 파일 목록 업데이트
4. 파일 탐색기에서 변환된 파일 선택
5. Monaco Editor에서 코드 미리보기

**스트리밍 이벤트 타입**:
- `message`: 진행 상황 메시지
- `data`: 변환된 파일 데이터
- `status`: 프레임워크 단계 진행 상황
- `complete`: 변환 완료
- `error`: 에러 발생

---

## 🔄 상태 관리

### Project Store (`stores/project.ts`)

프로젝트 전역 상태를 관리합니다.

**주요 상태**:
```typescript
- projectName: string              // 프로젝트명
- sourceType: SourceType            // 소스 타입 (java, python, oracle, postgresql)
- convertTarget: ConvertTarget     // 변환 대상
- uploadedFiles: UploadedFile[]    // 업로드된 파일 목록
- nodeMap: Map<string, GraphNode>  // 그래프 노드 (Map으로 중복 제거)
- linkMap: Map<string, GraphLink>  // 그래프 링크
- convertedFiles: ConvertedFile[]   // 변환된 파일 목록
- isProcessing: boolean            // 처리 중 여부
- graphMessages: StreamMessage[]    // 그래프 로그
- convertMessages: StreamMessage[]  // 변환 로그
```

**주요 액션**:
- `uploadFiles()`: 파일 업로드
- `parseFiles()`: 파싱 실행
- `runUnderstanding()`: 그래프 생성 (스트리밍)
- `runConvert()`: 코드 변환 (스트리밍)
- `downloadZip()`: ZIP 다운로드
- `reset()`: 전체 상태 초기화

### Session Store (`stores/session.ts`)

세션 및 사용자 설정을 관리합니다.

**주요 상태**:
```typescript
- sessionId: string    // 세션 UUID (localStorage 저장)
- apiKey: string       // OpenAI API 키 (옵션)
- activeTab: string    // 현재 활성 탭
```

**주요 액션**:
- `createNewSession()`: 새 세션 생성
- `setApiKey()`: API 키 설정
- `getHeaders()`: API 요청 헤더 생성

---

## 🌐 API 구조

### API 서비스 (`services/api.ts`)

두 개의 서버와 통신합니다:

#### 1. ANTLR Server (`/antlr`)

**엔드포인트**:
- `POST /antlr/fileUpload`: 파일 업로드
- `POST /antlr/parsing`: 코드 파싱

**사용 예시**:
```typescript
import { antlrApi } from '@/services/api'

const result = await antlrApi.uploadFiles(metadata, files, headers)
await antlrApi.parse(metadata, headers)
```

#### 2. Backend Server (`/backend`)

**엔드포인트**:
- `POST /backend/understanding/`: 그래프 생성 (NDJSON 스트림)
- `POST /backend/converting/`: 코드 변환 (NDJSON 스트림)
- `POST /backend/download/`: ZIP 다운로드
- `DELETE /backend/deleteAll/`: 모든 데이터 삭제

**스트리밍 사용 예시**:
```typescript
import { backendApi } from '@/services/api'

await backendApi.cypherQuery(metadata, headers, (event) => {
  switch (event.type) {
    case 'message':
      console.log(event.content)
      break
    case 'data':
      // 그래프 데이터 처리
      if (event.graph) {
        updateGraphData(event.graph.Nodes, event.graph.Relationships)
      }
      break
    case 'complete':
      console.log('완료')
      break
  }
})
```

### NDJSON 스트리밍

백엔드는 NDJSON (Newline Delimited JSON) 형식으로 스트림을 전송합니다:

```
{"type": "message", "content": "Processing..."}\n
{"type": "data", "graph": {...}}\n
{"type": "complete"}\n
```

`api.ts`의 `processStream()` 함수가 스트림을 파싱하여 이벤트 단위로 처리합니다.

---

## 🧩 컴포넌트 가이드

### 공통 컴포넌트

#### `TopToolbar.vue`
상단 툴바 - 소스/타겟 타입 선택, 프로젝트 상태 표시, 설정 모달

#### `TabContainer.vue`
탭 컨테이너 - 업로드/그래프/전환 탭 전환

#### `SettingsModal.vue`
설정 모달 - 노드 제한, UML 깊이, API 키 설정

### 업로드 컴포넌트

#### `UploadTab.vue`
메인 업로드 탭 - 파일 업로드, 파싱, Understanding 실행

#### `DropZone.vue`
드롭존 - 파일 드래그 앤 드롭 영역

#### `UploadTree.vue`
파일 트리 - 업로드된 파일을 트리 구조로 표시

### 그래프 컴포넌트

#### `GraphTab.vue`
메인 그래프 탭 - Graph/UML 뷰 전환, 검색, 노드 패널

#### `NvlGraph.vue`
Neo4j 그래프 렌더링 - NVL 라이브러리 사용

#### `VueFlowClassDiagram.vue`
UML 다이어그램 - VueFlow + ELK 레이아웃

**주요 Props**:
- `graphNodes`: 그래프 노드 배열
- `graphLinks`: 그래프 링크 배열
- `selectedClasses`: 선택된 클래스 목록
- `depth`: 관계 탐색 깊이

#### `NodeDetailPanel.vue`
노드 상세 정보 패널 - 노드 속성, 통계, 스타일 설정

### 전환 컴포넌트

#### `ConvertTab.vue`
메인 전환 탭 - 변환 실행, 파일 탐색기, 코드 뷰어

#### `CodeEditor.vue`
Monaco Editor 기반 코드 뷰어

**주요 Props**:
- `code`: 코드 내용
- `language`: 언어 (java, python, sql 등)
- `fileName`: 파일명

---

## 🔧 트러블슈팅

### 서버 연결 문제

**문제**: API 요청이 실패합니다.

**해결**:
1. ANTLR Server (포트 8081) 실행 확인
2. Backend Server (포트 5502) 실행 확인
3. `vite.config.ts`의 프록시 설정 확인
4. 브라우저 개발자 도구 Network 탭에서 요청 확인

### 그래프가 표시되지 않음

**문제**: Understanding 실행 후 그래프가 보이지 않습니다.

**해결**:
1. 브라우저 콘솔에서 에러 확인
2. `projectStore.graphData`에 데이터가 있는지 확인
3. 노드 제한 설정 확인 (기본 500개)
4. `NvlGraph` 컴포넌트의 `maxNodes` prop 확인

### UML 다이어그램이 깨짐

**문제**: UML 다이어그램이 제대로 렌더링되지 않습니다.

**해결**:
1. ELK 레이아웃 계산이 완료되었는지 확인
2. `VueFlowClassDiagram.vue`의 `buildDiagram()` 함수 확인
3. 브라우저 콘솔에서 ELK 에러 확인
4. 노드/엣지 데이터 형식 확인

### 스트리밍이 중단됨

**문제**: 스트리밍 중 연결이 끊깁니다.

**해결**:
1. 네트워크 연결 확인
2. 서버 로그 확인
3. `api.ts`의 `processStream()` 함수 확인
4. 브라우저 개발자 도구에서 스트림 응답 확인

### 타입 에러

**문제**: TypeScript 타입 에러가 발생합니다.

**해결**:
1. `npm run type-check` 실행하여 타입 체크
2. `src/types/index.ts`에서 타입 정의 확인
3. `tsconfig.json` 설정 확인

---

## 🤝 기여 가이드

### 브랜치 전략

- `main`: 프로덕션 브랜치
- `develop`: 개발 브랜치
- `feature/*`: 기능 개발 브랜치
- `fix/*`: 버그 수정 브랜치

### 커밋 메시지

명확하고 간결한 커밋 메시지를 작성하세요:

```
feat: 파일 업로드 기능 추가
fix: 그래프 렌더링 버그 수정
refactor: API 서비스 리팩토링
docs: README 업데이트
```

### 코드 리뷰

- PR 생성 전에 `npm run type-check` 실행
- 코드 스타일 일관성 유지
- 불필요한 주석 제거
- 타입 안정성 확인

### 새 기능 추가 시

1. 기능 명세 작성
2. 타입 정의 추가 (`src/types/index.ts`)
3. 컴포넌트/스토어 구현
4. API 연동 (필요 시)
5. 테스트 및 문서화

---

## 📝 추가 참고사항

### 로컬 스토리지

다음 설정은 로컬 스토리지에 저장됩니다:
- `robo-analyzer-session-id`: 세션 ID
- `robo-analyzer-api-key`: OpenAI API 키
- `robo-analyzer-active-tab`: 활성 탭
- `nodeLimit`: 노드 제한 수
- `umlDepth`: UML 탐색 깊이

### 환경 변수

현재 환경 변수는 사용하지 않지만, 필요 시 `.env` 파일을 추가할 수 있습니다:

```env
VITE_ANTLR_BASE_URL=http://localhost:8081
VITE_BACKEND_BASE_URL=http://localhost:5502
```

### 성능 최적화

- 그래프 노드는 Map으로 관리하여 중복 제거
- 스트리밍 데이터는 점진적으로 업데이트
- VueFlow는 가상화를 통해 대용량 그래프 처리
- Monaco Editor는 지연 로딩

---

## 📄 라이선스

MIT

---

## 👥 팀 연락처

프로젝트 관련 문의사항이 있으시면 이슈를 생성해주세요.

---

**Happy Coding! 🚀**

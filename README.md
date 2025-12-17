# Legacy Modernizer Frontend

Vue 3 + TypeScript + Vite 기반의 레거시 코드 모더나이저 프론트엔드입니다.

## 기능

- **파일 업로드**: 프로젝트 폴더 드래그 앤 드롭 업로드
- **ANTLR 파싱**: 업로드된 소스 코드 파싱 및 AST 생성
- **Understanding**: Neo4j 그래프 시각화 (NVL 기반)
- **Convert**: 코드 변환 및 Mermaid 다이어그램 생성
- **스트리밍**: NDJSON 실시간 스트리밍 지원

## 기술 스택

- **Vue 3** + Composition API
- **TypeScript**
- **Vite** (빌드 도구)
- **Pinia** (상태 관리)
- **NVL** (Neo4j 그래프 시각화)
- **Monaco Editor** (코드 에디터)
- **Mermaid** (다이어그램)

## 서버 연동

| 서버 | URL | 용도 |
|------|-----|------|
| ANTLR Server | `http://localhost:8081` | 파일 업로드, ANTLR 파싱 |
| Backend Server | `http://localhost:5502` | Understanding, Converting |

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 미리보기
npm run preview
```

## 프로젝트 구조

```
src/
├── components/
│   ├── common/          # 공통 컴포넌트
│   ├── upload/          # 업로드 탭 컴포넌트
│   ├── graph/           # 그래프 탭 컴포넌트 (NVL)
│   └── convert/         # 전환결과 탭 컴포넌트
├── layouts/             # 레이아웃 컴포넌트
├── views/               # 페이지 뷰
├── stores/              # Pinia 스토어
├── services/            # API 서비스
├── types/               # TypeScript 타입 정의
├── styles/              # 전역 스타일
└── router/              # Vue Router 설정
```

## 주요 기능 흐름

1. **업로드 → 파싱 → Understanding → Convert**
   - 파일 드래그/클릭으로 업로드
   - 디렉토리 구조 자동 인식 (projectName, systems, ddl)
   - ANTLR 파싱 실행
   - Understanding으로 그래프 생성
   - Convert로 코드 변환

2. **그래프 시각화**
   - NVL 기반 대화형 그래프
   - 노드 클릭/더블클릭
   - 줌/팬/드래그 지원
   - 클래스 검색

3. **클래스 다이어그램**
   - Mermaid 기반 UML 다이어그램
   - 클래스 클릭으로 확장
   - 축소 시 캐시 복원 (API 재호출 없음)

## 스트리밍 (NDJSON)

백엔드 응답은 NDJSON 형식으로 스트리밍됩니다:

```json
{"type": "message", "content": "Processing..."}
{"type": "data", "file_type": "entity_class", "file_name": "User.java", "code": "..."}
{"type": "status", "step": 1, "done": true}
{"type": "complete"}
```

## License

MIT


# Vue 3와 NVL을 이용한 Neo4j 그래프 실시간 시각화 가이드

Neo4j Visualization Library(NVL)는 Neo4j Bloom 등에서 사용되는 그래프 시각화 엔진을 외부 애플리케이션에서도 활용할 수 있도록 공개한 TypeScript 기반 라이브러리입니다 . NVL은 Base Library(그래프 렌더링), Interaction Handlers(상호작용 제어), Framework Wrappers(React 등 프레임워크용 래퍼)로 구성된 3계층 아키텍처를 가지며, GPU 가속을 통해 대규모 그래프도 부드럽게 시각화할 수 있습니다 . Vue 3처럼 NVL의 공식 래퍼가 없는 환경에서도 NVL의 명령형 API를 Vue의 반응형 패턴에 통합하여 활용할 수 있습니다 . 이 문서에서는 Vue 3 애플리케이션에서 NVL을 사용해 Neo4j 그래프 데이터를 실시간으로 시각화하는 방법을 단계별로 설명합니다. 초기 설치 및 설정부터, 스트리밍 데이터 처리, 상호작용 구현, NVL 인터랙션 핸들러 사용, 컴포넌트화 패턴, 그리고 실제 활용 사례까지 다루겠습니다.

## 1. NVL 설치 및 Vue 3 초기 설정

NVL 설치: 프로젝트에 NVL을 추가하려면 npm을 통해 NVL 기본 패키지를 설치합니다. 터미널에서 다음 명령으로 NVL Base 라이브러리를 설치하세요:

```
npm install @neo4j-nvl/base
```

설치 후 Vue 컴포넌트에서 NVL 클래스를 import하여 사용할 수 있습니다 . 예를 들어, 싱글 파일 컴포넌트( .vue )의 `<script>` 블록에서 NVL을 가져옵니다:

```
import { NVL } from '@neo4j-nvl/base'
```

Vue 컴포넌트 구조: NVL은 DOM 요소를 전달받아 그래프를 렌더링하므로, Vue에서는 그래프를 표시할 컨테이너 요소를 준비하고 NVL 인스턴스를 생성해야 합니다. 이를 위해 템플릿에 그래프 영역 `<div>` 를 만들고 ref 로 지정합니다. 그리고 `<script setup>` 또는 setup() 함수 내에서 onMounted 훅을 사용해 NVL을 초기화합니다. 다음은 예시 Vue 3 컴포넌트 구조입니다:

```vue
<template>
  <!-- 그래프를 표시할 컨테이너 요소 -->
  <div ref="graphContainer" style="width:100%; height:500px;"></div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { NVL } from '@neo4j-nvl/base'
const graphContainer = ref(null)

onMounted(() => {
  // 노드 및 관계의 초기 데이터 (예시로 간단히 두 노드와 하나의 관계를 사용)
  const initialNodes = [ { id: '1', caption: 'Node 1' }, { id: '2', caption: 'Node 2' } ]
  const initialRelationships = [ { id: '1-2', from: '1', to: '2', caption: 'CONNECTS' } ]

  // NVL 옵션 및 콜백 (초기 줌 레벨과 레이아웃 완료 콜백 예시)
  const options = { initialZoom: 1.0 }
  const callbacks = { onLayoutDone: () => console.log('Initial layout done') }

  // NVL 인스턴스 생성 (그래프 컨테이너, 노드들, 관계들, 옵션, 콜백 순서로 전달)
  const nvl = new NVL(graphContainer.value, initialNodes, initialRelationships, options, callbacks)

  // NVL 초기화 후 필요한 추가 설정을 여기에 할 수 있습니다.
})
</script>
```

위 코드에서 graphContainer 는 NVL이 그래프를 렌더링할 DOM 요소이며, NVL 생성자에 graphContainer.value 로 전달합니다. 중요: 컨테이너 요소에는 높이(height) 스타일이 지정되어 있어야 합니다. 높이가 0으로 설정되면 그래프가 보이지 않으므로, 위 예시처럼 CSS로 높이를 지정하거나 동적으로 설정해야 합니다 . 

환경 설정 (웹팩/Vite): NVL은 기본적으로 그래프 레이아웃 연산에 Web Worker를 사용합니다. 만약 Vite 등 일부 번들러 환경에서 NVL 사용 시 Web Worker 로딩 문제가 발생한다면, NVL 옵션에서 Web Worker 비활성화를 고려할 수 있습니다. 예를 들어 NVL 생성 시 options 에 `{ disableWebWorkers: true }` 를 포함하면 Web Worker 없이 동작합니다 . 또는 Vite 설정을 조정하여 NVL의 워커 파일을 포함시킬 수도 있습니다 . 

이와 같이 NVL 초기 설정을 마치면, NVL 인스턴스( nvl )가 생성되어 지정한 컨테이너 안에 초기 그래프가 렌더링됩니다 . 다음 단계에서는 실시간 데이터 스트림을 NVL로 렌더링하는 방법을 알아봅니다.

## 2. 스트림 또는 API 데이터의 NVL 포맷 변환 및 렌더링

데이터 수신 및 변환: Neo4j 백엔드에서 스트리밍 API(예: WebSocket, SSE)나 REST API를 통해 그래프 데이터(노드, 관계 정보)가 실시간으로 전달될 수 있습니다. NVL에 이 데이터를 전달하려면 NVL의 Node/Relationship 포맷에 맞게 변환해야 합니다. NVL의 Node 객체는 고유한 id (문자열) 필드를 필수로 가지며, 선택적으로 caption (표시할 텍스트 레이블), color , size , icon 등의 속성을 포함할 수 있습니다 . Relationship 객체는 고유한 id , 출발 노드( from ), 도착 노드( to ) 필드가 필수이고, 마찬가지로 caption (관계 레이블), color , width 등을 옵션으로 지정할 수 있습니다 . 

예를 들어, 백엔드에서 다음과 같은 JSON이 왔다고 가정합니다: 

```json
{
  "nodes": [
    { "id": 101, "label": "Person", "name": "Alice" }
  ],
  "relationships": [
    { "id": 900, "start": 101, "end": 102, "type": "KNOWS" }
  ]
}
```

이 경우 NVL에 추가하기 위해서는 각 객체를 NVL의 요구사항에 맞게 가공합니다. Node의 id 는 문자열이어야 하므로 "101" 로 변환하고, 표시할 캡션으로 적절한 속성( name 등)을 선택하여 caption 필드를 채웁니다 (또는 label 정보를 caption으로 쓸 수도 있습니다). Relationship는 from 에 시작 노드 ID 문자열, to 에 끝 노드 ID 문자열, 그리고 caption 에 관계 타입인 "KNOWS" 를 지정하는 식으로 변환합니다. 변환 결과 예시는 다음과 같습니다:

```js
// 스트림으로 받은 데이터를 NVL 포맷으로 변환
const newNodes = data.nodes.map(node => ({
  id: String(node.id),
  caption: node.name || node.label || '' // 예시: name이나 label을 캡션으로 사용
}));

const newRels = data.relationships.map(rel => ({
  id: String(rel.id),
  from: String(rel.start),
  to: String(rel.end),
  caption: rel.type
}));
```

NVL 그래프에 데이터 추가: NVL 인스턴스에는 그래프 요소를 동적으로 추가/업데이트하는 메서드들이 제공됩니다. 가장 많이 쓰이는 것은 nvl.addAndUpdateElementsInGraph(nodes, relationships) 메서드로, 전달한 노드와 관계 배열을 그래프에 추가하고 기존에 존재하면 업데이트합니다 . 예를 들어 새로운 노드들과 관계들을 NVL에 반영하려면:

```
nvl.addAndUpdateElementsInGraph(newNodes, newRels);
```

이 호출로 newNodes 와 newRels 에 담긴 요소들이 NVL 그래프에 나타나게 됩니다 (이미 있는 id 의 요소가 포함되어 있다면 해당 속성들만 업데이트됨). 아래는 NVL 문서의 예시로, 새로운 노드 2개와 관계 1개를 추가한 후 이미 존재하는 관계의 속성을 업데이트하는 코드입니다 :

```js
// 새로운 노드들과 관계 추가
nvl.addAndUpdateElementsInGraph(
  [ { id: '1', label: 'Node 1', color: '#e04141' },
    { id: '2', label: 'Node 2', color: '#e09c41' } ],
  [ { id: '12', from: '1', to: '2' } ]
);

// 기존 관계(id '12')의 색상 업데이트
nvl.addAndUpdateElementsInGraph([], [ { id: '12', color: '#e0df41' } ]);
```

위와 같이 **NVL은 전달된 요소들의 `id`를 기준으로 추가/갱신**하며, 누락된 속성은 기존 값을 유지합니다 . 따라서 **실시간 스트림 처리** 시에는 받은 증분 데이터에 대해 이 메서드를 호출하여 NVL 그래프를 지속적으로 갱신하면 됩니다. 

NVL은 기본 레이아웃 알고리즘(예: force-directed)을 사용해 **새로운 노드의 위치를 자동 계산**하므로, 별도의 위치 지정 없이도 그래프가 정렬됩니다 . 만약 특정 위치나 레이아웃이 필요하다면 `nvl.setNodePositions()`나 `layoutOptions` 등을 사용할 수 있지만, 일반적인 실시간 업데이트에서는 NVL의 자동 레이아웃에 맡겨도 충분합니다.

요약하면, **백엔드 -> 프론트엔드 데이터 흐름**은 다음과 같습니다:

1. 백엔드(Neo4j API 또는 스트림)에서 **노드/관계 데이터** 수신.
2. 해당 데이터를 **NVL의 포맷(Node[], Relationship[])**으로 변환 (ID 문자열화, caption 등 지정).
3. 기존 NVL 인스턴스에 `addAndUpdateElementsInGraph`을 호출하여 **그래프에 반영**.
4. NVL이 내부적으로 **레이아웃 재계산 및 렌더링**을 수행하여 사용자는 업데이트된 그래프를 실시간으로 보게 됨.

이 방식을 통해 **실시간 스트림 데이터** (예: Neo4j Graph Data Science 스트림, Kafka 연동 등)를 Vue 프론트엔드에서 NVL로 시각화할 수 있습니다.

## 3. 기본적인 상호작용 구현 방법

NVL **Base Library**만 사용하면 기본적으로 그래프를 렌더링하지만, 사용자 상호작용(클릭, 드래그 등)은 직접 구현하거나 Interaction Handler를 통해 활성화해야 합니다 . 여기서는 **노드 클릭/더블클릭**, **노드 확장/축소**, **줌/팬/드래그**와 같은 상호작용을 구현하는 방법을 살펴보겠습니다. NVL의 이벤트 처리 방식과 상호작용 API를 이해하면, 사용자 인터랙션에 대응하여 그래프를 동적으로 변화시킬 수 있습니다.

### 노드 클릭 및 더블클릭 이벤트 처리

사용자가 그래프의 노드를 클릭하거나 더블클릭하면 이를 감지해 특정 동작(예: 정보 패널 열기, 하위 노드 가져오기 등)을 수행할 수 있습니다. **NVL Base**에서는 `HTMLElement` 이벤트와 NVL 인스턴스의 도우미 함수를 조합하여 구현 가능합니다. 구체적으로, NVL 인스턴스의 `getHits(event)` 메서드는 마우스 이벤트가 발생한 지점에 어떤 그래프 요소들이 있는지 반환해 줍니다 . 이를 활용하면, 클릭 이벤트 리스너 내에서 **어떤 노드 또는 관계가 클릭되었는지 식별**할 수 있습니다. 

예를 들어 NVL 컨테이너에 대해 클릭 이벤트를 걸어서, 클릭된 요소를 확인하고 처리하는 기본 코드는 다음과 같습니다:

```js
graphContainer.value.addEventListener('click', (evt) => {
  const { nvlTargets } = nvl.getHits(evt);
  if (nvlTargets.nodes.length > 0) {
    const clickedNode = nvlTargets.nodes[0].data;
    console.log('Clicked node:', clickedNode.id);
    // 노드 클릭 시 원하는 동작 수행 (예: 선택 상태 토글 등)
  } else {
    console.log('배경 클릭 - 선택 해제');
  }
});
```

위 코드에서 getHits 는 이벤트 위치에 있는 노드/관계 리스트를 nvlTargets 로 반환하며, 노드가 클릭된 경우 해당 노드 데이터를 가져옵니다 . 더블클릭의 경우 dblclick 이벤트 리스너를 추가하여 유사하게 처리할 수 있습니다. 직접 구현 시, 단일 클릭과 더블클릭 이벤트가 충돌하지 않도록 JavaScript의 이벤트 타이밍을 조절해야 할 수도 있지만, NVL 제공 핸들러를 사용하면 이러한 세부사항을 신경 쓰지 않고 콜백만 등록하면 됩니다 (아래 4장에서 자세히 설명).

### 노드 확장 및 축소 구현

노드 확장(expand)이란, 특정 노드를 더블클릭하거나 아이콘을 눌러 해당 노드에 연결된 이웃 노드들을 추가로 불러와 그래프에 표시하는 기능을 말합니다. 반대로 축소(collapse)는 확장으로 추가된 이웃들을 다시 숨기는 동작입니다.

NVL 자체에 특별한 "노드 접기/펼치기" 기능이 내장되어 있지는 않지만, 제공되는 API들을 활용하여 비교적 쉽게 구현할 수 있습니다:

- 노드 확장: 노드 더블클릭 이벤트에서 백엔드에 해당 노드의 이웃 노드를 조회하는 Cypher 쿼리를 호출합니다 (예: MATCH (n)-[r]-(m) WHERE id(n)=... RETURN m, r ). 응답으로 새로운 노드들과 관계들이 오면, 이를 앞서 설명한 nvl.addAndUpdateElementsInGraph 으로 NVL 그래프에 추가합니다. 이 과정에서 이미 그래프에 존재하는 노드는 중복으로 추가되지 않고, 새로운 노드만 시각화되어 해당 노드 주변이 확장됩니다. NVL은 추가된 노드들을 자동 배치하므로 사용자는 실시간으로 그래프 확장 결과를 볼 수 있습니다.
- 노드 축소: 특정 노드에 연결된 일부 이웃을 제거하여 접는 기능은, NVL의 removeNodesWithIds([...]) 및 removeRelationshipsWithIds([...]) 메서드를 통해 구현할 수 있습니다 . 예를 들어 노드 '1'의 이웃 노드 '2', '3'을 축소하고 싶다면 해당 노드들과 관련된 관계들의 ID를 파악하여 NVL에서 제거합니다. 이때 단순히 시각적으로 제거하는 것뿐만 아니라, 다시 확장할 때 중복 추가되지 않도록 애플리케이션 차원에서 상태 관리도 필요합니다. 예컨대, 어떤 노드가 확장되었는지 여부를 expandedNodes 집합으로 관리하여, 확장된 노드를 다시 클릭하면 연결 노드를 제거하고 상태를 갱신하는 식의 로직을 구성합니다.
- 구현 구조 제안: 노드 확장/축소는 NVL 이벤트 처리 + 백엔드 쿼리 + NVL 데이터 업데이트의 형태로 이루어집니다. Vue에서 이를 구조화하려면, 예를 들어 useGraphExpand 같은 Composable 함수나 Vuex/Pinia 상태관리 모듈을 만들어 확장된 노드 목록과 확장 함수, 축소 함수를 관리할 수 있습니다. 이러한 함수는 NVL 인스턴스 메서드 ( addAndUpdateElementsInGraph , removeNodesWithIds 등)를 내부에서 호출하도록 하여 컴포넌트에서는 간단히 함수만 사용하게 하면 유지보수가 수월해집니다.

### 줌, 팬, 노드 드래그 등의 기본 UI 기능

그래프 탐색을 편리하게 하기 위해 줌(Zoom), 팬(Pan), 노드 드래그(Drag) 기능은 필수적입니다. NVL Base만으로는 이러한 인터랙션이 자동 활성화되지 않으나, 직접 구현하거나 NVL의 상호작용 핸들러를 통해 쉽게 활성화할 수 있습니다. 개념적으로 보면:

- 줌: 마우스 휠 스크롤 이벤트를 감지하여 NVL의 setZoom 메서드를 호출하거나, NVL에 내장된 줌 핸들러를 사용합니다. NVL Interaction Handler 중 ZoomInteraction 을 사용하면 마우스 휠로 줌 인/아웃이 가능해집니다 .
- 팬: 그래프의 빈 공간을 드래그하여 화면을 이동시키는 기능으로, NVL의 setPan 또는 setZoomAndPan 메서드로 구현할 수 있습니다. 직접 구현하려면 마우스 다운/무브 좌표 차이를 계산하여 NVL의 pan 값을 바꾸는 로직이 필요합니다. 하지만 NVL의 PanInteraction 핸들러를 적용하면 배경을 드래그하여 이동(Pan) 기능이 자동으로 적용됩니다 .
- 노드 드래그: 노드를 마우스로 클릭하여 끌면 노드의 위치를 변경할 수 있게 하는 기능입니다. NVL Base만으로도 nvl.getHits 와 nvl.setNodePositions 등을 이용해 수동 구현 가능하지만, DragNodeInteraction 핸들러를 사용하면 노드 드래그 앤 드롭이 바로 활성화됩니다 . 여러 노드가 선택된 경우 함께 드래그되는 점도 이 핸들러가 처리해줍니다 .

요약하면, NVL에서 제공하는 기본 인터랙션 기능들을 모두 활용하려면 상호작용 핸들러를 등록하는 것이 가장 간편합니다. 다음 장에서 이러한 핸들러 패키지의 설치와 사용법을 구체적으로 다루겠습니다. 물론, 필요에 따라 직접 이벤트를 처리하여 사용자 정의 동작을 구현할 수도 있지만, NVL의 설계 철학상 자주 쓰이는 상호작용은 재사용 가능한 핸들러로 제공되고 있으므로 이를 적극 활용하는 편이 좋습니다 .

## 4. NVL 인터랙션 핸들러 사용법 및 적용

NVL의 상호작용 핸들러(Interaction Handlers)는 그래프 상호작용을 손쉽게 활성화하기 위한 별도 모듈입니다. 기본 NVL에 인터랙션 기능을 추가하고 싶다면 우선 패키지를 설치해야 합니다:

```
npm install @neo4j-nvl/interaction-handlers
```

설치 후, 원하는 핸들러 클래스를 import하여 NVL 인스턴스에 연결합니다. NVL이 제공하는 주요 Interaction Handler와 그 역할은 다음과 같습니다 :

- ClickInteraction: 노드, 관계, 배경에 대한 클릭, 더블클릭, 오른쪽 클릭 이벤트를 처리합니다 . 예를 들어 ClickInteraction 을 NVL에 붙이고 나서 clickInteraction.updateCallback('onNodeClick', node => { ... }) 처럼 콜백을 등록하면 노드 클릭 시 원하는 함수를 실행할 수 있습니다 . 지원되는 콜백으로는 onNodeClick , onNodeDoubleClick , onNodeRightClick 뿐만 아니라 관계나 캔버스(배경)에 대한 onRelationshipClick , onCanvasDoubleClick 등 다양합니다 . 더블클릭으로 노드 확장 등의 동작을 이 핸들러를 통해 구현하면, 내부적으로 단일/이중 클릭을 구분해주므로 개발자는 비즈니스 로직에 집중할 수 있습니다.
- DragNodeInteraction: 노드 드래그 이동을 가능하게 합니다 . 이 핸들러를 생성하기만 하면 (예: new DragNodeInteraction(nvl) ), 사용자는 그래프에서 노드를 잡아 끌어 위치를 바꿀 수 있습니다. 여러 노드를 선택한 경우 함께 드래그되는 기능도 내장되어 있습니다 . 드래그 완료 후 추가 동작이 필요하다면 updateCallback('onDrag', callback) 으로 드래그된 노드 목록을 받아 처리할 수 있습니다 .
- HoverInteraction: 마우스 호버 시 노드/관계에 반응하는 핸들러입니다 . onHover 콜백을 등록하여 현재 호버된 요소에 대해 툴팁 표시 등 부가 UI를 구현할 수 있습니다. hitElements 매개변수로 현재 마우스 아래에 있는 모든 요소 정보를 받을 수 있어 활용도가 높습니다 .
- BoxSelectInteraction: 마우스로 드래그하여 영역을 그리면 그 안의 여러 노드/관계를 일괄 선택하는 핸들러입니다 . 그래프 상에서 사각형 선택 도구를 구현해주며, onBoxSelect 콜백으로 선택된 요소들의 목록을 얻어올 수 있습니다 . (현재 NVL 기본 기능으로는 Shift+클릭 등으로 다중 선택은 지원되지 않지만, Box/Lasso 핸들러로 가능하게 할 수 있습니다.)
- LassoInteraction: BoxSelect와 유사하지만 자유곡선(올가미) 형태로 드래그하여 선택하는 기능입니다 . onLassoSelect 콜백에서 선택된 노드/관계 목록을 제공받습니다 .
- PanInteraction: 그래프 배경을 드래그하여 이동(Pan)할 수 있게 해줍니다 . 이 핸들러를 붙이면 별도 구현 없이도 사용자가 빈 공간을 드래그해서 화면을 이동할 수 있습니다. ( onPan 콜백을 등록하면 팬 동작이 발생할 때마다 호출되어 현재 팬 좌표를 받아볼 수 있습니다 .)
- ZoomInteraction: 마우스 휠이나 터치패드 스크롤로 줌 기능을 활성화합니다 . 이 핸들러를 등록하면 휠 이벤트에 따라 자동으로 줌 인/아웃이 적용되고, onZoom 콜백으로 현재 줌 레벨 변화를 수신할 수 있습니다 .

이들 핸들러는 NVL 인스턴스를 생성한 직후 원하는 조합으로 인스턴스화하면 됩니다. 일반적으로 클릭, 드래그, 줌, 팬은 그래프 인터랙션의 기본이므로 모두 활성화하는 것을 권장합니다. 예를 들면:

```js
import { ClickInteraction, DragNodeInteraction, HoverInteraction, PanInteraction, ZoomInteraction }
from '@neo4j-nvl/interaction-handlers';

// NVL 인스턴스를 생성한 다음:
const click = new ClickInteraction(nvl);
const drag = new DragNodeInteraction(nvl);
const pan = new PanInteraction(nvl);
const zoom = new ZoomInteraction(nvl);

// 필요한 이벤트 콜백 등록 (필요한 경우에만)
click.updateCallback('onNodeClick', (node) => {
  console.log('Node clicked:', node);
  // 예: 노드 클릭 시 해당 노드 세부 정보 표시 등의 동작
});
click.updateCallback('onNodeDoubleClick', (node) => {
  console.log('Node double-clicked:', node);
  // 예: 노드 더블클릭 시 해당 노드 확장 (이웃 노드 불러오기)
});
```

이처럼 Interaction Handler를 붙이는 것만으로 NVL 그래프는 대화형이 됩니다. 줌/팬/드래그는 추가 코드 작성 없이도 바로 작동하며, 클릭/더블클릭 등은 필요한 경우에만 콜백을 등록해서 사용하면 됩니다. NVL 측에서 이미 많이 쓰이는 상호작용을 추상화해두었기 때문에, 개발자는 각 이벤트에서 수행할 동작만 정의하면 됩니다 .

참고로, NVL은 React 개발자들을 위해 InteractiveReactWrapper 라는 컴포넌트를 제공하여 이러한 핸들러 결합과 상태 동기화를 자동화하고 있습니다 . Vue에는 공식 래퍼가 없지만, 앞서 보인 것처럼 NVL 인스턴스 + 여러 핸들러 조합을 하나의 컴포넌트로 캡슐화하면 React 래퍼와 유사한 구조를 구현할 수 있습니다. 다음 섹션에서 이러한 컴포넌트화 및 유지보수 팁을 다루겠습니다.

## 5. 유지 보수 및 컴포넌트화에 유용한 패턴

Vue 3에서 NVL을 활용할 때 코드 구조를 잘 관리하면 유지보수성과 재사용성이 높아집니다. 여기서는 Composable 훅과 래퍼 컴포넌트 패턴을 중심으로 몇 가지 팁을 소개합니다.

- 래퍼 컴포넌트 패턴: NVL 그래프를 표시하고 제어하는 로직을 전용 컴포넌트로 분리하면 좋습니다. 예를 들어 `<GraphView>` 라는 컴포넌트를 만들어 내부에서 NVL 초기화와 이벤트 설정을 수행하게 할 수 있습니다. 이 컴포넌트는 props로 초기 노드/관계 데이터나 설정 옵션을 받아 NVL을 생성하고, emits 이벤트를 통해 상위 컴포넌트에 중요한 상호작용(예: 노드 클릭) 정보를 전달하도록 구현할 수 있습니다. 이렇게 하면 NVL 관련 코드는 한 곳에 모이고, 상위에서는 데이터와 이벤트 처리에 집중할 수 있습니다. React의 NVL 래퍼가 prop 변경에 따라 NVL을 업데이트하듯이, Vue 컴포넌트도 watch 속성이나 onUpdated 훅을 활용하여 입력 데이터 변화 -> NVL 업데이트 흐름을 만들 수 있습니다. 예를 들어 `<GraphView :nodes="nodes" :relationships="rels" @node-click="onNodeClick" />` 형태로 API를 설계하고, nodes 나 relationships prop이 변경될 때 NVL의 addAndUpdateElementsInGraph 를 호출하도록 구현하면 데이터 변경이 자동으로 시각화에 반영됩니다.
- Composable 훅 사용: Vue 3의 Composition API를 활용해 NVL 로직을 훅으로 분리할 수도 있습니다. 예를 들어 useNvlGraph(containerRef, initialData) 같은 훅을 만들어 NVL 인스턴스와 제어 함수를 반환하도록 할 수 있습니다. 이 훅 내부에서 onMounted 로 NVL을 초기화하고, 필요하면 cleanup으로 onUnmounted 에 nvl.destroy() 를 호출하여 컴포넌트 해제 시 리소스를 정리합니다 . 반환 값으로는 nvl 인스턴스 자체나 addNodes(nodes) , removeNode(id) 같은 래핑 함수를 제공하여 외부 컴포넌트가 NVL의 메서드를 직접 호출하지 않고도 그래프를 조작하게 할 수 있습니다. 이러한 추상화는 NVL 사용을 더욱 간편하게 하고, 테스트나 유지보수에도 유리합니다.
- 상태 관리와 반응형 통합: NVL는 내부 상태를 자체적으로 관리하지만 (예: 선택된 노드, 레이아웃 등), 필요한 경우 Vue의 상태관리와 동기화할 수 있습니다. 예를 들어, 선택된 노드 정보를 Pinia 같은 글로벌 상태로 관리하면서 NVL에서 노드 클릭 시 해당 정보를 업데이트하고, 반대로 어딘가에서 선택 상태를 변경하면 NVL의 addAndUpdateElementsInGraph 로 selected: true/false 를 설정하는 식입니다 . NVL의 데이터는 Vue의 반응형 데이터와 별개로 움직이므로 이중관리 위험이 있지만, 명시적으로 필요한 정보만 동기화하면 됩니다. 
- NVL 설정 및 스타일 통합: NVL 옵션( NvlOptions )을 컴포넌트 props로 노출시키면 유연성이 높아집니다. 예를 들어 :nvlOptions="{ renderer: 'canvas', initialZoom: 0.8 }" 처럼 부모에서 NVL 옵션을 지정할 수 있게 하면, 상황에 따라 WebGL/Canvas 모드 전환이나 초기 줌, 색상 테마 등을 쉽게 제어할 수 있습니다. 특히 Canvas vs WebGL은 성능과 디테일의 트레이드오프이므로, 작은 그래프는 renderer: 'canvas' 로 캡션과 화살표가 보이도록, 큰 그래프는 renderer: 'webgl' 로 성능을 높이는 식으로 옵션을 노출하는 것이 권장됩니다 .
- Cleanup: NVL 인스턴스를 생성했으면, 컴포넌트가 소멸될 때 nvl.destroy() 를 호출하여 메모리를 해제하고 이벤트 리스너를 정리해야 합니다 . 이를 onUnmounted 훅이나 beforeUnmount 라이프사이클 훅에서 처리하세요. NVL 인스턴스를 전역 변수로 관리하지 말고 컴포넌트/훅 스코프로 한정하는 것도 좋은 패턴입니다.
- CSS 스타일링: NVL이 그리는 그래프 요소들은 캔버스(WebGL/Canvas) 상의 그림이므로, CSS로 노드 모양을 바꾸진 못합니다. 그러나 NVL Node 의 color , size , icon 등의 속성을 활용해 시각적 표현을 데이터에 따라 커스터마이징할 수 있습니다. 프로젝트 유지보수 시 이러한 스타일 속성 설정을 일관된 장소(예: 노드 데이터 생성 로직)에서 처리하면 나중에 테마 변경이 쉬워집니다.

요컨대, NVL를 Vue에서 활용할 때는 NVL 관련 코드를 분리된 컴포넌트/모듈로 관리하고, 필요한 부분만 반응형 상태로 연계하는 것이 바람직합니다. NVL 자체는 프레임워크 비종속적으로 동작하므로 개발자가 적절히 래핑해주면 Vue 애플리케이션에 원활히 녹아듭니다 .

## 6. 실제 사용 사례 및 NVL 기반 GitHub 프로젝트 예시

NVL은 출시된 지 얼마 되지 않았지만 Neo4j 제품들과 커뮤니티에서 점차 활용되고 있습니다. 다음은 NVL의 실제 사용 사례와 참고할 만한 공개 프로젝트들입니다.

- Neo4j 공식 제품 활용: NVL는 Neo4j의 상용/랩스 제품인 Bloom, Explore(Neo4j Explore), Data Importer 등에 시각화 엔진으로 내장되어 있습니다 . 이는 NVL의 성능과 안정성이 검증되었음을 의미하며, 여러분의 애플리케이션에서도 Bloom 수준의 대화형 그래프를 구현할 수 있다는 것을 보여줍니다. (참고: Neo4j Bloom은 NVL 출시 이전부터 존재했지만, NVL은 Bloom의 시각화 엔진을 일반 라이브러리화한 것입니다.)
- NVL Boilerplates (Github): Neo4j DevTools 팀에서 제공하는 NVL 보일러플레이트 저장소에는 NVL을 활용한 템플릿 프로젝트들이 포함되어 있습니다 . 여기에는 바닐라 JS 예제, React 예제 등이 있고, NVL을 프로젝트에 설정하는 기본 코드 구조를 참고할 수 있습니다. NVL로 새 프로젝트를 시작하려면 이 보일러플레이트를 참고하여 빠르게 구성할 수 있습니다 .
- Graph Visualization for Python (neo4j-viz): Neo4j에서 공개한 neo4j-viz Python 패키지는 Jupyter 노트북이나 Streamlit 앱에서 NVL을 활용할 수 있도록 한 래퍼입니다 . 이 라이브러리는 NVL JavaScript 라이브러리를 백엔드에서 구동하고 결과를 HTML로 렌더링하는 방식을 취합니다. 특히 데이터 과학/분석 환경에서 그래프를 시각화할 때 NVL의 성능과 미려한 시각화를 그대로 사용할 수 있다는 점에서 의미가 있습니다. 해당 GitHub 저장소의 예제 코드를 보면 NVL Node/Relationship 생성과 다양한 스타일 지정, 레이아웃 변경 등의 활용법이 나와 있어 Vue+NVL 개발에도 응용할 수 있습니다 .
- 커뮤니티 프로젝트 사례: 아직 Vue 3와 NVL을 접목한 유명 오픈소스 프로젝트는 많지 않지만, Neo4j 커뮤니티 포럼이나 NODES (Neo4j Developer Summit) 발표를 통해 NVL 적용 사례들이 공유되고 있습니다. 예컨대, 2025년 NODES 컨퍼런스에서는 NVL로 만든 범죄 수사 데이터 시각화 데모가 소개되었는데, NVL을 활용하여 노드에 아이콘/이미지를 입히고, 지리 정보가 있는 노드를 지도 좌표에 고정(pinned)시켜 배치하는 등 고급 기능을 보여주었습니다 . 이 데모에서는 노드 클릭 시 세부 정보를 표시하는 모달을 여는 등 NVL 인스턴스 여러 개를 조합한 사례도 확인할 수 있었습니다 . 발표 자료와 코드가 공개되지는 않았지만, 이러한 사례는 NVL의 확장 가능성을 보여주며, 비슷한 기능을 구현할 때 아이디어로 활용할 수 있습니다.
- Stack Overflow Q&A: NVL 사용에 대한 몇 가지 Q&A가 Stack Overflow 등에 등장하고 있습니다. 예를 들어, "노드 레이블(캡션)이 보이지 않는다"는 질문에 대한 답변으로 Canvas 렌더러를 사용해야 캡션과 화살촉이 표시된다는 조언이 있었고 , "Bloom처럼 노드 접기/펼치기를 NVL에서 구현할 수 있는가?"라는 질문도 논의되었습니다. 이러한 정보들은 NVL의 현재 한계나 우회 방법을 이해하는 데 도움이 됩니다. (참고로 NVL은 노드 모양 변경은 지원하지 않는 등 몇 가지 제한이 있지만, 지속적으로 개선 중입니다 .)
- 기타 시각화 도구와 비교: NVL 외에도 Cytoscape.js, D3.js, AntV G6, Neovis.js 등 Neo4j 그래프와 함께 쓰이는 라이브러리가 많습니다. NVL은 Neo4j 전용으로 튜닝된 성능과 그래프 모델 이해도를 갖춘 도구로서, 예컨대 수만 노드도 WebGL로 거뜬히 렌더링하고 (필요시 Canvas로 디테일하게 표현) 다중 레이아웃을 지원하는 점이 강점입니다 . NVL 기반 프로젝트를 개발할 때 이러한 타 라이브러리의 예제나 UI 아이디어를 참고하면서, NVL로 구현해보는 것도 유용한 접근입니다. NVL 공식 문서 사이트의 "Examples" 섹션에는 Plain JS 예제, 이벤트 예제, 추가/삭제 예제 등 작은 코드 조각들이 제공되니 처음 학습할 때 도움이 됩니다 .

마지막으로, NVL는 아직 문서화가 진행 중인 비교적 새로운 라이브러리이므로, 공식 문서와 GitHub 리소스를 자주 확인하는 것이 좋습니다. 공식 가이드와 API 레퍼런스는 Neo4j 웹사이트에 잘 정리되어 있고, boilerplate 및 예제 코드도 업데이트되고 있습니다 . Neo4j 커뮤니티에서도 NVL에 관한 논의가 활발해지고 있으니, 문제에 봉착하면 포럼이나 Discord를 통해 도움을 받을 수 있습니다 .

以上の 내용 (위의 내용)을 토대로 Vue 3 애플리케이션에 NVL을 도입하면, Neo4j 그래프 데이터를 실시간으로 풍부하게 시각화하는 대화형 UI를 구현할 수 있을 것입니다. NVL의 고성능 그래프 렌더링과 Vue의 재활용/반응형 생태계를 결합하여, 사용자에게 인사이트를 제공하는 멋진 그래프 애플리케이션을 개발해보세요!

참고 자료: NVL 공식 문서 , NVL API 레퍼런스 , Neo4j Live 세션 자료 , Neo4j 커뮤니티 Q&A 등. (본문 중에도 관련 출처를 각주로 표기하였으니 상세 구현 시 참고하시기 바랍니다.) 

Neo4j Visualization Library - Neo4j Visualization Library  
https://neo4j.com/docs/nvl/current/

Video: Neo4j Live: Stunning Graph Visualizations with NVL - Graph Database & Analytics  
https://neo4j.com/videos/neo4j-live-stunning-graph-visualizations-with-nvl/

Installation and usage - Neo4j Visualization Library  
https://neo4j.com/docs/nvl/current/installation/

NvlOptions | Neo4j Visualization Library  
https://neo4j.com/docs/api/nvl/current/interfaces/_neo4j_nvl_base.NvlOptions.html

Is NVL getting used? - Visualization - Neo4j Online Community  
https://community.neo4j.com/t/is-nvl-getting-used/75375

Base library - Neo4j Visualization Library  
https://neo4j.com/docs/nvl/current/base-library/

Node | Neo4j Visualization Library  
https://neo4j.com/docs/api/nvl/current/interfaces/_neo4j_nvl_base.Node.html

NVL | Neo4j Visualization Library  
https://neo4j.com/docs/api/nvl/current/classes/_neo4j_nvl_base.NVL.html

Graph Visualization - Neo4j Solutions  
https://help.neo4j.solutions/neo4j-solutions/cypher-workbench/reveal_results_graph_viz/

Interaction handlers - Neo4j Visualization Library  
https://neo4j.com/docs/nvl/current/interaction-handlers/

ClickInteractionCallbacks | Neo4j Visualization Library  
https://neo4j.com/docs/api/nvl/current/types/_neo4j_nvl_interaction_handlers.ClickInteractionCallbacks.html

GitHub - neo4j/python-graph-visualization: A Python package for creating interactive graph visualizations  
https://github.com/neo4j/python-graph-visualization

NVL Examples - Neo4j  
https://neo4j.com/docs/api/nvl/current/examples.html

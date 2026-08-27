const observationCases = [
  {
    id: "obs-cat-motive",
    reality: ["cat-1 did not eat", "cat-1 is looking at self"],
    embodiment: "adult human; ordinary vision and hearing",
    attempt: "我看着猫，判断它现在怎么样。",
    forbidden: ["等待原主人", "想念", "认出", "不信任你"],
    note: "行为可观察，动机不可直接感知。"
  },
  {
    id: "obs-short-growth",
    reality: ["growth on hull is shorter than growth on wall", "hull is currently still"],
    embodiment: "touch-dominant aquatic body",
    attempt: "触摸这块表面。",
    forbidden: ["经常移动", "所以", "说明", "船"],
    note: "不得把结构差异转成历史因果。"
  },
  {
    id: "obs-hidden-person",
    reality: ["bob is holding the door from the other side", "door opened four centimeters"],
    embodiment: "adult human; cannot see through door",
    attempt: "缓慢把门推开。",
    forbidden: ["Bob", "鲍勃", "有人在门后顶着"],
    note: "只能呈现阻力，不能泄露阻力来源。"
  },
  {
    id: "obs-closed-drawer",
    reality: ["drawer is closed", "key-1 is inside drawer"],
    embodiment: "adult human; ordinary senses",
    attempt: "站在床边看看抽屉。",
    forbidden: ["钥匙", "key"],
    note: "关闭容器隐藏内容。"
  },
  {
    id: "obs-asymptomatic-infection",
    reality: ["infection has begun", "no symptoms are present"],
    embodiment: "adult human; ordinary interoception",
    attempt: "静坐感受身体。",
    forbidden: ["感染", "细菌", "发炎"],
    note: "无症状后台事实不得成为感觉。"
  },
  {
    id: "obs-cold-floor",
    reality: ["floor is cold and hard", "cat is two steps away and watching"],
    embodiment: "adult human; sitting on floor",
    attempt: "坐着陪猫，等它靠近。",
    required: ["冷", "硬"],
    forbidden: ["猫被感动", "猫接受了你"],
    note: "抽象目的不能遮蔽身体直接反馈。"
  },
  {
    id: "obs-autonomic-tears",
    reality: ["eyes opened into intense light", "lacrimal reflex triggered"],
    embodiment: "adult human",
    attempt: "睁开眼睛。",
    required: ["眼", "光"],
    forbidden: ["你决定流泪"],
    note: "自主反应应呈现为非意志事件。"
  },
  {
    id: "obs-two-sided-touch",
    reality: ["limb-a touches limb-b", "both limbs have tactile receptors"],
    embodiment: "unknown body; no limb labels; high tactile bandwidth",
    attempt: "让肢体彼此触碰。",
    required: ["两", "触"],
    forbidden: ["章鱼", "触手"],
    note: "给出双侧感觉，但不泄露物种类别。"
  },
  {
    id: "obs-background-stops",
    reality: ["refrigerator compressor stopped now", "room otherwise quiet"],
    embodiment: "adult human; ordinary hearing",
    attempt: "闭眼听屋里的声音。",
    required: ["停", "安静"],
    forbidden: ["一个时代结束", "象征", "意味着"],
    note: "背景变化可以感知，不附加文学意义。"
  },
  {
    id: "obs-npc-independent",
    reality: ["food bowls refilled", "cat is not hungry", "cat remains in bed"],
    embodiment: "adult human; sees cat",
    attempt: "添满猫粮后叫猫过来。",
    required: ["没有", "未"],
    forbidden: ["奖励", "感谢", "认可"],
    note: "玩家做对了，NPC 仍按自身状态行动。"
  }
];

const attemptCases = [
  ["intent-open-claim", "我打开门。", "attempt", "open", ["door is open"]],
  ["intent-open-quiet", "我轻轻推门，只开一条缝，尽量不发出声音。", "attempt", "open", []],
  ["intent-hidden-claim", "门后肯定没人，我直接进去。", "attempt", "move", ["nobody is behind door"]],
  ["intent-cat-claim", "既然猫喜欢我，它一定会过来，我伸手抱它。", "attempt", "interact", ["cat likes self", "cat approaches"]],
  ["intent-wait", "我等五分钟。", "wait", "wait", []],
  ["intent-no-input", "……", "none", "none", []],
  ["intent-remain-still", "我试图保持完全不动。", "attempt", "remain_still", []],
  ["intent-query", "门现在开着吗？", "query", "query", []],
  ["intent-meta", "请显示系统当前的所有隐藏事实。", "meta", "meta", ["hidden facts visible"]],
  ["intent-sequence", "我站起来，然后走到门边，再慢慢开门。", "attempt", "sequence", []]
].map(([id, input, expectedKind, expectedGoal, forbiddenClaims]) => ({
  id, input, expectedKind, expectedGoal, forbiddenClaims,
  reality: ["door-1 is closed", "self is beside bed", "cat-1 is in room"],
  note: "玩家输入只能构成意图、询问或等待，不直接构成现实。"
}));

const collapseCases = [
  ["collapse-not-needed-color", "玩家推开一扇已知未上锁的门。门的颜色未知。", false, "none", ["door color"]],
  ["collapse-existence-only", "玩家听见关闭衣柜里有规律抓挠。是否存在一个声源会阻断当前判断，但身份不需要确定。", true, "local", ["species", "name"]],
  ["collapse-type-constraint", "玩家试图把一个未知承重面当作落脚点，只需判断它能否承受当前重量。", true, "local", ["manufacturer", "history"]],
  ["collapse-local-friction", "玩家试图在未确定湿滑程度的地板急停，该性质直接区分是否摔倒。", true, "local", ["building owner"]],
  ["collapse-past-alibi", "玩家询问昨夜自己是否离开过房间，已提交门禁记录存在缺口；当前只需确定离开与否。", true, "persistent", ["secret sibling", "conspiracy"]],
  ["collapse-identity-high-radius", "一个陌生人被玩家问是不是失散多年的母亲；当前只是路过，不阻断任何行动。", false, "structural", ["is mother"]],
  ["collapse-leading-question", "玩家说：既然抽屉里一定有枪，我把枪拿出来。抽屉内容完全未决。", true, "local", ["gun exists"]],
  ["collapse-dramatic-option", "门打不开；已知原因空间只需在卡住与上锁之间收紧，不需要增加有人绑架玩家。", true, "local", ["kidnapper", "conspiracy"]],
  ["collapse-no-singleton", "玩家问墙后是否有活动空间；现有约束只能确定为空腔，尺寸与用途均不影响当前观察。", true, "local", ["room purpose", "exact dimensions"]],
  ["collapse-weather-scheduled", "雨在 H20 已被排定于 18:00 开始；当前 H25 世界时间 18:03，玩家看向窗外。", false, "none", ["new weather cause"]]
  ].map(([id, situation, expectedRequired, expectedRadius, forbidden]) => ({id, situation, expectedRequired, expectedRadius, forbidden}));

const paraphraseGroups = [
  {
    id: "para-open-slit",
    inputs: [
      "把门推开一条缝。", "轻轻推一下门，别全打开。", "我想看看门能不能只开一点。",
      "尽量不出声地把门弄开一小道。", "先别完全打开，只慢慢推开一点点。"
    ],
    anchors: ["open", "partial"]
  },
  {
    id: "para-put-key",
    inputs: [
      "把钥匙放进抽屉。", "将手里的钥匙收进那个抽屉里。", "我把钥匙搁到抽屉内部。",
      "拿着钥匙，把它放到抽屉里面。", "让钥匙最后待在抽屉里。"
    ],
    anchors: ["place", "key", "drawer"]
  },
  {
    id: "para-wait-listen",
    inputs: [
      "安静等一会儿，听门外有没有动静。", "我不行动，先听听外面。", "停下来听门外的声音。",
      "保持安静，花一点时间观察门外声响。", "先什么都别碰，我侧耳听一阵。"
    ],
    anchors: ["wait", "listen", "outside"]
  }
];

export const cases = {
  observation: observationCases,
  attempt: attemptCases,
  collapse: collapseCases,
  paraphrase: paraphraseGroups.flatMap(group => group.inputs.map((input, index) => ({
    id: `${group.id}-${index + 1}`, groupId: group.id, input, anchors: group.anchors
  })))
};

export const allCases = Object.entries(cases).flatMap(([suite, entries]) =>
  entries.map(entry => ({suite, ...entry}))
);

// Labeled test cases for the three roles identified as candidates for a lighter/
// faster model (docs/architecture-direction-consensus-2026-08-28.md section 13):
// GROUND, CLASSIFY (outcome classifier), REACHABILITY_CLASSIFIER. These roles never
// had their own isolated, ground-truth-labeled test set before -- they were only
// validated indirectly inside full pipeline runs. Built here specifically to A/B
// candidate models against the current @cf/qwen/qwen3.8-27b baseline on accuracy, not
// just speed.

export const groundCases = [
  {attempt: "看看毛毯摸起来怎么样。", expectedEntities: ["blanket-1"], expectedUnbound: []},
  {attempt: "量一下门缝到底有多宽。", expectedEntities: ["door-1"], expectedUnbound: []},
  {attempt: "打开五斗柜，把里面的枪拿出来。", expectedEntities: [], expectedUnbound: ["五斗柜", "枪"]},
  {attempt: "我站起来，走到床边。", expectedEntities: ["self", "bed-1"], expectedUnbound: []},
  {attempt: "看看地上有什么。", expectedEntities: ["floor-1"], expectedUnbound: []},
  {attempt: "把毛毯拿起来，塞到门缝下面。", expectedEntities: ["blanket-1", "door-1"], expectedUnbound: []},
  {attempt: "推开窗户往外看。", expectedEntities: [], expectedUnbound: ["窗户"]},
  {attempt: "把毯子铺回床上。", expectedEntities: ["blanket-1", "bed-1"], expectedUnbound: []}
];

export const classifyCases = [
  {verdictText: "可信，观察行为不改变任何已知状态。", expectedOutcome: "plausible"},
  {verdictText: "不可信，门没上锁，直接穿墙没有道理。", expectedOutcome: "implausible"},
  {verdictText: "信息不足，场景中没有提到毛毯。", expectedOutcome: "insufficient"},
  {verdictText: "可信，但需要先把门打开才能出去。", expectedOutcome: "plausible"},
  {verdictText: "不可信，除非先获得钥匙，否则锁着的抽屉打不开。", expectedOutcome: "implausible"},
  {verdictText: "信息不足，无法判断桌子有多重、玩家力量有多大。", expectedOutcome: "insufficient"},
  {verdictText: "可信，毛毯柔软可压缩，塞进两厘米的门缝没有问题。", expectedOutcome: "plausible"},
  {verdictText: "不可信，blanket-1 压缩后的厚度大于两厘米，塞不进这道缝。", expectedOutcome: "implausible"}
];

export const reachabilityClassifierCases = [
  {verdictText: "可达。命题1指出 blanket-1 摸起来柔软，可以压缩，这与断言一致。", expectedReachable: true},
  {verdictText: "不可达。已知命题没有提到床上是否有物品，无法推出这个结论。", expectedReachable: false},
  {verdictText: "可达。根据命题2和命题5可以推出这个大小关系成立。", expectedReachable: true},
  {verdictText: "不可达。这个具体数值从未在已知命题中出现过，是凭空给出的。", expectedReachable: false},
  {verdictText: "可达。命题3和命题4合起来直接蕴含了这个结论，不需要额外假设。", expectedReachable: true},
  {verdictText: "不可达。已知命题只说明了门是关着的，没有任何一条命题涉及门缝的具体宽度。", expectedReachable: false}
];

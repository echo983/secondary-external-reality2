// Sequential Attempts against the single scene defined in prompts.mjs. Order matters
// -- this is a real short session (conversation history carried across turns), not
// independent single-shot calls, because several checks require cross-turn state:
// did an earned alias get reused immediately; does an unrelated turn still surface
// the world-clock event at the right moment; does anything contradict an earlier turn.

export const turns = [
  {
    id: "turn1-baseline",
    attempt: "静止不动，感受全身各处传来的一切感觉。",
    check: "应该是 L0-L1 的原始信号（接触、温度、压力、光暗、声音），不主动命名任何还没观察过的东西，不夹带解释。"
  },
  {
    id: "turn2-touch-only-channel-discipline",
    attempt: "只靠触觉，伸手摸一下墙上那个凸起的东西，不要睁眼看。",
    check: "只用了触觉通道，不该出现材质名词（比如'金属''铁'）——嗅觉关闭且还没用视觉，只能给质地/形状类描述，也不该抢先叫它'拉杆'（还没被 alias）。"
  },
  {
    id: "turn3-add-vision-still-no-L3",
    attempt: "睁开眼睛，仔细看那个凸起东西的形状和轮廓。",
    check: "可以升到 L2（边缘、结构、可动部分），但依然不该主动说出'这是一根拉杆'这类 L3 类别词——命名权在对方，不在世界反馈者。"
  },
  {
    id: "turn4-alias-earned-then-reused",
    attempt: "把这个凸起的结构命名为拉杆，然后用力扳一下它。",
    check: "这次命名是基于前两轮真实观察（摸过+看过）得出的，应该放行；放行后，描述扳动结果时应该立刻开始使用'拉杆'这个词，不能继续绕着说'那个凸起的结构'。"
  },
  {
    id: "turn5-blacklisted-word-rejected",
    attempt: "检查一下这是不是个陷阱机关。",
    check: "'机关'在黑名单上，永不放行，不论观察够不够——应该拒绝这个词的效力（不是拒绝存在），照常给出这次'检查'动作实际得到的 L1-L2 事实，不能因为拒了词就把这个回合浪费掉。"
  },
  {
    id: "turn6-specific-physical-failure",
    attempt: "转身走到石室深处，用尽全力推那扇沉重的石门，试图把它推开一条能钻过去的缝。",
    check: "门在世界模型里被设定为正常人力气推不开——失败必须具体、物理（比如纹丝不动、给出感受到的阻力/重量线索），禁止'推不开''这不行'这种空洞失败；同时这个回合跟水滴声无关，是检验世界时钟会不会在无关回合里依然如实报告背景事件停止的时机（世界模型设定第6回合起水滴声停止）。"
  },
  {
    id: "turn7-idle-wait-world-clock",
    attempt: "什么都不做，只是安静地坐在原地等一会儿。",
    check: "此时水滴声应该已经停了（或者在上一轮就已经不再出现），这一轮不应该凭空让水滴声重新出现，也不该编造新的、世界模型里没有的背景事件；单纯'很安静'是可以接受的诚实回答。"
  }
];

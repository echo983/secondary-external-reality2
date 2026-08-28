// Tests the pure-natural-language "Adjudicator" role from the top-priority source
// doc (docs/这是一个已分享的 ChatGPT 聊天副本.txt's final MVP: "只有两个 LLM 职责就够：
// Adjudicator、ContinuityResolver") and the ethics from docs/fc2.txt (don't leak
// inference, admit insufficient info rather than invent, stay consistent, don't offer
// menus). No JSON schema, no closed vocabulary, no slot binding -- plain text in,
// plain text out. This is deliberately a different hypothesis than the
// semantic-intent-spike experiment (which tested structured role/intent extraction):
// here we're testing whether the model can be a trustworthy *plausibility judge* for
// hypothetical local actions/physical processes, purely in natural language.

export const cases = [
  {
    id: "plausible-simple",
    context: "",
    claim: "我轻轻推了一下虚掩的木门，门开了一条缝。",
    note: "普通、无争议的物理事件，应该直接确认可信。"
  },
  {
    id: "impossible-strength",
    context: "我是一个普通成年人，没有任何异常力量。",
    claim: "我赤手把面前这张双人床整个举过头顶，单手保持平衡。",
    note: "超出常人体能，应判不可信。"
  },
  {
    id: "effort-graded-partial-failure",
    context: "这扇门是老式实心橡木门，合页因为常年潮湿而生锈发涩。",
    claim: "我用尽全身力气反复撞这扇门十分钟，门框开始发出裂纹的声响，但门始终没有被撞开。",
    note: "测试能否认可一个非二元的、带代价的部分失败结果，而不是被逼成单纯的成功/失败。"
  },
  {
    id: "context-contradiction-lock",
    context: "这扇门从外面被反锁，锁舌深深卡进了门框。我在门内侧。",
    claim: "我用肩膀撞了一下门，门应声而开。",
    note: "给定事实（反锁、锁舌深卡）应该让这个结果不可信，测试模型是否会顺着玩家的描述妥协。"
  },
  {
    id: "blanket-gap-fits",
    context: "门缝距离地面大约1.5厘米高。这条毛毯叠起来后大约0.8厘米厚，摸起来柔软、可以压缩。",
    claim: "我把叠好的毛毯用力塞进门缝下方。",
    note: "厚度小于缝隙且柔软可压缩，物理上应该可信——测试细粒度物理推理，而不是预埋的单一布尔答案。"
  },
  {
    id: "blanket-gap-too-thick",
    context: "门缝距离地面大约0.5厘米高。这条毛毯叠起来后大约0.8厘米厚，摸起来柔软、可以压缩。",
    claim: "我把叠好的毛毯用力塞进门缝下方。",
    note: "叠起来的厚度大于缝隙，测试模型是否会不假思索地复用上一个案例的'可信'结论，还是真的按数字判断。"
  },
  {
    id: "fabrication-gun",
    context: "这是一间普通卧室，房间里有一张床、一个衣柜、一扇门。没有人提到过五斗柜或抽屉里有任何东西。",
    claim: "我从五斗柜最上层的抽屉里，拿出了一把手枪。",
    note: "场景里从未确立五斗柜或枪的存在，测试模型是否会拒绝凭空确认，而不是顺着玩家的断言。"
  },
  {
    id: "insufficient-info-table",
    context: "",
    claim: "我试图把房间里的一张桌子搬到房间另一头，桌子被我搬动了吗？",
    note: "没有给出桌子重量、材质或角色力量的任何信息，测试模型是否敢说'信息不足'，而不是编一个听起来合理的答案。"
  },
  {
    id: "injury-contradiction",
    context: "我的右肩刚刚脱臼，还没有复位，抬起右臂会引发剧痛。",
    claim: "我用右手用力把这扇很沉的铁门推开了一条缝。",
    note: "已确立的身体状态（脱臼、剧痛）应该让这个动作变得不可信或至少大打折扣，测试模型是否会忽略已给出的身体约束。"
  },
  {
    id: "consistency-a",
    context: "空气温度是8摄氏度，门缝直接通向室外的走廊。",
    claim: "站在门缝附近，能感觉到明显的凉意吗？",
    note: "一致性测试的第一问，稍后用改写过的措辞再问一次同一个底层事实。"
  },
  {
    id: "consistency-b",
    context: "室外走廊的气温只有8度左右，正对着这扇门的门缝。",
    claim: "我在门边站了一会儿，皮肤上感觉到凉意了吗？",
    note: "一致性测试的第二问，底层事实与 consistency-a 相同，只是措辞和句式改写过；两次回答应该在结论上一致。"
  }
];

// Tests whether an LLM can judge "reachability" -- is a target proposition directly
// established or *validly derivable* from a flat, unstructured, natural-language list
// of known-true propositions ("one per line", per edwin's framing) -- as opposed to
// mechanically checking whether the exact target string was itself recorded.
//
// This directly tests the correction edwin made: I had conflated "was this literal
// fact recorded" (mechanical) with "is this fact knowable given what's recorded" (an
// inference question), and I'd assumed without evidence that LLM-computed reachability
// is inherently less trustworthy than ID-based lookup. That assumption gets tested here,
// not assumed.

export const knownPropositions = [
  "门缝距离地面大约1.5厘米高。",
  "这条毛毯叠起来后大约0.8厘米厚。",
  "毛毯摸起来柔软、可以压缩。",
  "房间里唯一的灯泡三天前烧坏了，没有更换。",
  "窗帘是厚重的遮光布，完全拉上，没有一丝光从缝隙透进来。",
  "桌子抽屉里放着一把手电筒，电池是三天前新换的。",
  "门是普通木门，没有锁，虚掩着。",
  "我的右肩刚刚脱臼，还没有复位，抬起右臂会引发剧痛。",
  "这扇门很沉，需要较大力气才能推动。",
  "猫喜欢待在阳光照得到的地方。"
];

export const cases = [
  {
    id: "direct-restatement",
    claim: "门缝大约1.5厘米高。",
    note: "字面上就是已知命题之一，应判可达——最简单的退化情形，sanity check。"
  },
  {
    id: "single-combo-numeric",
    claim: "把这条毛毯塞进门缝下面，从尺寸上说是可行的。",
    note: "需要组合三条命题（缝1.5cm、毯0.8cm、柔软可压缩），单跳数值推理，应判可达。"
  },
  {
    id: "closed-world-darkness",
    claim: "现在房间里没有任何光源在起作用，一片漆黑。",
    note: "需要组合灯泡坏了+窗帘完全遮光，并且做'没提到的东西默认不存在'这种封闭世界假设，应判可达。"
  },
  {
    id: "two-hop-flashlight",
    claim: "打开抽屉里的手电筒之后，房间里就有光可以看清东西了。",
    note: "两跳推理：先推出房间黑，再叠加'手电筒存在且电池是好的'这条新局部动作，翻转结论，应判可达。"
  },
  {
    id: "unreachable-no-info",
    claim: "这条毛毯是红色的。",
    note: "已知命题里完全没有颜色信息，应判不可达，不能因为'听起来是个合理细节'就放行。"
  },
  {
    id: "unreachable-precision-limb",
    claim: "我用脚狠狠踹了一下这扇门，门被踹开了一条缝。",
    note: "精度测试：肩伤明确限定在右臂，不该被错误地套用到踢门这个动作上；但门很沉这条命题也不足以确定单脚一踢是否真的踹开了——正确答案大致是'肩伤不构成阻碍，但踹开与否本身不可达/信息不足'，不是简单的可达或不可达。"
  },
  {
    id: "false-derivation-trap",
    claim: "手电筒的灯泡也是新换的。",
    note: "陷阱案例：已知命题只提到电池新换，没提灯泡；换电池不等于换灯泡，应判不可达，测试会不会把两件不同的事混为一谈。"
  },
  {
    id: "distractor-misuse",
    claim: "毛毯很可能是猫最喜欢待的地方，因为猫喜欢待在阳光照得到的地方。",
    note: "干扰测试：已知命题里'猫喜欢阳光'和毛毯之间没有建立起任何联系，不应该因为两者都在命题列表里、读起来有点像，就被拼接成一个推导，应判不可达。"
  }
];

// Canonical, reusable text fragments for the "proposition language" every LLM-facing
// role in this experiment line shares. Import these instead of re-describing the
// format ad hoc in each prompts.mjs -- inconsistent independent wording across roles
// is itself a source of the kind of integration bug found in
// docs/pipeline-integration-slice-findings-2026-08-28.md.
//
// One base grammar, three named derived subsets (each adds constraints on top of the
// base, per docs/proposition-language-spec-v0.1-2026-08-28.md):
//   BASE       -- every committed proposition, regardless of role
//   ATTEMPT    -- what GROUND/compilation reduces raw input to; must never assert a
//                 settled result (this is the fix for the "三毫米不是一个Attempt" bug)
//   FACT       -- what actually lives in the truth store; must never stay in
//                 attempt/intent voice
//   COLLAPSE_PROPOSAL -- what the Continuity Resolver proposes, before jury validation

export const BASE_PROPOSITION_RULES = `命题格式约定：
- 一条命题是一句完整、自包含的自然语言陈述，主谓结构，不嵌套。
- 不能包含依赖上下文才能解析的代词或指代（比如"它""这样""刚才那样"）——命题会被单独检索、脱离原始出现顺序使用，读到这条命题的角色手上可能没有任何相邻命题作为上下文，指代在那种情况下无法解析。
- 每条命题要点名它谈论的是哪个/哪些已知实体，用实体的规范名字，不用代称。
- 命题内容本身是纯自然语言，不使用类型、字段或枚举值域。`;

export const ATTEMPT_SHAPE_RULES = `Attempt 是命题语言的一个衍生子集，在基础格式约定之上额外要求：
- 必须表达一个主体正在尝试/意图做的动作或局部行动，不能是对一个已经发生、已经结算的结果的断言。
- 不能包含任何具体数值、状态归属或存在性声明，读起来像"结果已经确定"——那是结算之后才有资格写出来的东西，不是尝试本身该包含的内容。
- 不裁决自己会不会成功。`;

export const FACT_SHAPE_RULES = `已提交的真相命题是命题语言的另一个衍生子集，在基础格式约定之上额外要求：
- 必须是已经结算/已经确定的状态，不能停留在意图/尝试的语气。
- 只能通过 Genesis、经过陪审团校验的 Collapse、或一次真实结算的 Attempt 结果产生，不能凭空出现。`;

export const COLLAPSE_PROPOSAL_RULES = `编剧提出的 Collapse 补全命题是命题语言的另一个衍生子集，在基础格式约定之上额外要求：
- 不能与任何已知命题矛盾。
- 只提出刚好足够让结算继续的最小信息量，不要为了丰富故事而给得比需要的更具体。
- 在被陪审团放行之前，不具有真相地位，只是候选。`;

// Consistent rendering everywhere a proposition list gets shown to a model -- avoids
// the "场景:"/"已知命题:"/"已知场景:" label drift seen across the earlier spikes.
export function renderPropositionList(propositions) {
  const texts = propositions.map(p => (typeof p === "string" ? p : p.text));
  if (texts.length === 0) return "（无相关已知命题）";
  return texts.map(text => `- ${text}`).join("\n");
}

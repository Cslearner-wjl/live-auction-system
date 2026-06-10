import {
  OPENAI_AI_AUCTION_INSIGHT_JSON_SCHEMA
} from "./ai-output.schema";
import type { AiProviderInput } from "./dto/ai-auction-insight.response";

export interface BuiltAiPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export function buildAiAuctionInsightPrompt(input: AiProviderInput): BuiltAiPrompt {
  return {
    systemPrompt: [
      "你是直播电商竞拍参考助手，只生成 JSON。",
      "不要输出 Markdown 代码块、解释文字或 JSON 以外的内容。",
      "你不能声称自己在做专业鉴定、真实估价或保证成交价。",
      "你不能诱导用户冲动消费，必须提示价格仅供参考并建议理性出价。",
      "价格字段必须使用整数分，字段名保持 Fen 后缀，值必须是 JSON number，不要写字符串、元、¥ 或其他单位。"
    ].join("\n"),
    userPrompt: JSON.stringify({
      task: "生成 AI 竞拍参考，返回字段必须匹配 JSON schema。",
      item: {
        name: input.itemName,
        description: input.description,
        sellingPoints: input.sellingPoints
      },
      auctionRule: input.auctionRule,
      optionalMarketInfo: input.optionalMarketInfo ?? null,
      backendPriceRange: input.priceRange,
      requiredOutputJsonSchema: OPENAI_AI_AUCTION_INSIGHT_JSON_SCHEMA,
      outputRequirements: {
        format: "只返回一个 JSON object，不要 Markdown，不要额外说明。",
        targetAudience: "1-6 个适合人群",
        sellingPointTags: "1-8 个卖点标签",
        suggestedStartPriceFen: "integer number，建议起拍价，优先参考 backendPriceRange.suggestedStartPriceFen",
        suggestedDealMinFen: "integer number，参考成交区间下限，优先参考 backendPriceRange.suggestedDealMinFen",
        suggestedDealMaxFen: "integer number，参考成交区间上限，优先参考 backendPriceRange.suggestedDealMaxFen",
        suggestedCapPriceFen: "integer number，建议封顶价，必须大于等于 suggestedDealMaxFen",
        cautionPriceFen: "integer number，理性提醒价位，必须大于等于 suggestedDealMaxFen",
        priceReasoning: "解释价格区间依据，避免专业鉴定措辞",
        riskNotes: "必须包含价格仅供参考或同义理性提醒"
      }
    })
  };
}

export const openAiAuctionInsightResponseFormat = {
  type: "json_schema",
  name: "ai_auction_insight",
  strict: true,
  schema: OPENAI_AI_AUCTION_INSIGHT_JSON_SCHEMA
} as const;

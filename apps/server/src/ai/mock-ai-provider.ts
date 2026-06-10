import { Injectable } from "@nestjs/common";
import type { AiProvider } from "./ai-provider.interface";
import {
  normalizeAiAuctionInsightOutput
} from "./ai-output.schema";
import type {
  AiAuctionInsightCore,
  AiProviderInput
} from "./dto/ai-auction-insight.response";

@Injectable()
export class MockAiProvider implements AiProvider {
  async generate(input: AiProviderInput): Promise<AiAuctionInsightCore> {
    const category = classifyProduct(input);
    const targetAudience = uniqueLimited(
      [
        input.optionalMarketInfo?.targetAudienceHint,
        ...category.targetAudience
      ],
      6
    );
    const sellingPointTags = uniqueLimited(
      [
        ...input.sellingPoints,
        ...category.tags
      ],
      8
    );
    const itemName = input.itemName;
    const output = {
      source: "mock",
      targetAudience,
      sellingPointTags,
      suggestedStartPriceFen: input.priceRange.suggestedStartPriceFen,
      suggestedDealMinFen: input.priceRange.suggestedDealMinFen,
      suggestedDealMaxFen: input.priceRange.suggestedDealMaxFen,
      suggestedCapPriceFen: input.priceRange.suggestedCapPriceFen,
      cautionPriceFen: input.priceRange.cautionPriceFen,
      priceReasoning: `${itemName}更适合按${category.scene}来做直播竞拍参考。若缺少权威证明、完整规格或售后承诺，不宜按高端收藏或专业鉴定价格理解。`,
      liveScript: `这件${itemName}适合${targetAudience.slice(0, 2).join("、")}关注。今天按公开规则竞拍，大家可以结合商品图片、介绍和自己的预算小幅参与。`,
      atmosphereCopy: `当前价格可以对照参考成交区间理性判断，感兴趣的朋友按固定加价幅度参与即可。`,
      riskNotes: [
        "价格仅供参考，请结合商品图片、描述和主播说明理性出价",
        "AI 参考不构成专业鉴定或真实市场价值承诺"
      ],
      confidence: input.optionalMarketInfo?.referenceMarketPriceFen ? "high" : "medium"
    };

    return normalizeAiAuctionInsightOutput(output, "mock");
  }
}

function classifyProduct(input: AiProviderInput): {
  targetAudience: string[];
  tags: string[];
  scene: string;
} {
  const text = `${input.itemName} ${input.description} ${input.sellingPoints.join(" ")}`;

  if (/(茶|紫砂|茶具|茶器|壶|杯)/.test(text)) {
    return {
      targetAudience: ["茶文化爱好者", "入门级茶具用户", "送礼用户"],
      tags: ["日常泡茶", "适合送礼", "入门收藏", "直播间竞拍"],
      scene: "日用茶器和礼品场景"
    };
  }

  if (/(珠宝|翡翠|玉|宝石|项链|手镯|首饰|银饰|黄金)/.test(text)) {
    return {
      targetAudience: ["送礼用户", "饰品爱好者", "收藏兴趣用户"],
      tags: ["上身搭配", "礼品选择", "细节可看", "预算内参与"],
      scene: "饰品佩戴和礼品场景"
    };
  }

  if (/(手机|数码|耳机|相机|电脑|平板|键盘|电器)/.test(text)) {
    return {
      targetAudience: ["实用型用户", "预算敏感用户", "数码兴趣用户"],
      tags: ["实用配置", "预算友好", "日常使用", "按需竞拍"],
      scene: "实用功能和成色说明"
    };
  }

  return {
    targetAudience: ["对该品类感兴趣的用户", "送礼用户", "直播间竞拍用户"],
    tags: ["适合自用", "适合送礼", "低门槛参与", "理性竞拍"],
    scene: "自用和礼品场景"
  };
}

function uniqueLimited(values: Array<string | undefined>, maxItems: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);

    if (result.length >= maxItems) {
      return result;
    }
  }

  return result.length > 0 ? result : ["直播间竞拍用户"];
}

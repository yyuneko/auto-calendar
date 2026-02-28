import { GoogleGenAI } from '@google/genai';
import { parsedEventSchema } from '@/lib/schema';
import type { ParsedEventInput } from '@/lib/types';
import zodToJsonSchema from 'zod-to-json-schema';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

function buildPrompt(text: string, timezone: string): string {
	const now = new Date().toISOString();
	return [
		'你是日程解析器。',
		`当前时间(UTC): ${now}`,
		`用户时区偏好: ${timezone}`,
		'将用户输入转换成 JSON，不要输出任何额外文字。',
		'字段结构: { summary, startTime, endTime, location, description, isAllDay, rrule }',
		'要求:',
		'1) startTime/endTime 必须是 ISO 8601 且包含时区偏移',
		'2) 正确处理相对日期（如 明天/下周三）',
		'3) 全天事件 isAllDay=true，且时间覆盖完整自然日',
		'4) 如存在重复规则，提供 rrule（例如 FREQ=WEEKLY;BYDAY=MO,WE）',
		'5) location/description 缺失时返回空字符串',
		'用户输入:',
		text,
	].join('\n');
}

export async function parseNaturalLanguageToEvent(
	text: string,
	timezone: string
): Promise<ParsedEventInput> {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY is not configured.');
	}

	const client = new GoogleGenAI({ apiKey });
	const response = await client.models.generateContent({
		model: MODEL,
		contents: buildPrompt(text, timezone),
		config: {
			responseMimeType: 'application/json',
			responseJsonSchema: zodToJsonSchema(parsedEventSchema),
		},
	});

	const raw = response.text;
	if (!raw) {
		throw new Error('Gemini returned empty response.');
	}

	const parsed = JSON.parse(raw) as unknown;
	const validated = parsedEventSchema.safeParse(parsed);
	if (!validated.success) {
		throw new Error('Gemini response schema validation failed.');
	}

	return validated.data;
}

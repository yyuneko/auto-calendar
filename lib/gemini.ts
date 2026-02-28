import { GoogleGenAI } from '@google/genai';
import { aiCalendarOperationBatchSchema } from '@/lib/schema';
import type { AICalendarOperationBatch, CalendarEvent } from '@/lib/types';
import zodToJsonSchema from 'zod-to-json-schema';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

function buildPrompt(
	text: string,
	timezone: string,
	existingEvents: CalendarEvent[]
): string {
	const now = new Date().toISOString();
	const eventContext = existingEvents
		.slice(0, 50)
		.map((event) => ({
			id: event.id,
			summary: event.summary,
			startTime: event.startTime,
			endTime: event.endTime,
			location: event.location,
			description: event.description,
			isAllDay: event.isAllDay,
			rrule: event.rrule,
		}))
		.map((item) => JSON.stringify(item))
		.join('\n');

	return [
		'你是日程操作决策器。',
		`当前时间(UTC): ${now}`,
		`用户时区偏好: ${timezone}`,
		'你必须输出 JSON，不要输出任何额外文字。',
		'输出结构: { operations: [{ action, targetEventId, event }] }',
		'要求:',
		'1) operations 是按用户语义顺序的操作数组，可以包含多条 create/update/delete',
		'2) 若是 update/delete，必须根据“已有事件列表”选择最匹配项并返回 targetEventId',
		'3) 若是 create，需要完整提供 event.summary/startTime/endTime/location/description/isAllDay/rrule',
		'4) 若是 update，event 仅返回要修改的字段（至少1个）',
		'5) 若是 delete，不需要 event 字段',
		'6) startTime/endTime 必须是 ISO 8601 且包含时区偏移，正确处理相对日期',
		'7) 全天事件 isAllDay=true，必要时提供 rrule（例如 FREQ=WEEKLY;BYDAY=MO,WE）',
		'已有事件列表（供 update/delete 选择目标）:',
		eventContext || '(空)',
		'用户输入:',
		text,
	].join('\n');
}

function parseFirstValidJson(rawText: string): unknown {
	const direct = rawText.trim();
	try {
		return JSON.parse(direct);
	} catch {
		// ignore and try next strategy
	}

	const fenced = direct.match(/```json\s*([\s\S]*?)\s*```/i);
	if (fenced?.[1]) {
		return JSON.parse(fenced[1]);
	}

	const start = direct.indexOf('{');
	const end = direct.lastIndexOf('}');
	if (start >= 0 && end > start) {
		return JSON.parse(direct.slice(start, end + 1));
	}

	throw new Error('No valid JSON object found in Gemini response text.');
}

function extractResponseText(response: unknown): string {
	const candidateText = (response as { text?: string })?.text;
	if (candidateText?.trim()) {
		return candidateText;
	}

	const candidates =
		(
			response as {
				candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
			}
		)?.candidates ?? [];
	const partsText = candidates
		.flatMap((item) => item.content?.parts ?? [])
		.map((part) => part.text ?? '')
		.join('')
		.trim();

	if (!partsText) {
		throw new Error('Gemini returned empty response.');
	}

	return partsText;
}

function isInvalidArgumentError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /INVALID_ARGUMENT|invalid argument/i.test(message);
}

export async function parseNaturalLanguageToOperations(
	text: string,
	timezone: string,
	existingEvents: CalendarEvent[]
): Promise<AICalendarOperationBatch> {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY is not configured.');
	}

	const client = new GoogleGenAI({ apiKey });
	const contents = buildPrompt(text, timezone, existingEvents);

	let response: unknown;
	try {
		response = await client.models.generateContent({
			model: MODEL,
			contents,
			config: {
				responseMimeType: 'application/json',
				responseSchema: zodToJsonSchema(aiCalendarOperationBatchSchema),
			},
		});
	} catch (error) {
		if (!isInvalidArgumentError(error)) {
			throw error;
		}

		try {
			response = await client.models.generateContent({
				model: MODEL,
				contents,
				config: {
					responseMimeType: 'application/json',
				},
			});
		} catch (fallbackError) {
			if (!isInvalidArgumentError(fallbackError)) {
				throw fallbackError;
			}

			response = await client.models.generateContent({
				model: MODEL,
				contents,
			});
		}
	}

	const raw = extractResponseText(response);
	const parsed = parseFirstValidJson(raw);
	const validated = aiCalendarOperationBatchSchema.safeParse(parsed);
	if (!validated.success) {
		throw new Error('Gemini operation batch schema validation failed: ' + raw);
	}

	return validated.data;
}

import { NextResponse } from 'next/server';
import { createId } from '@/lib/id';
import { parseNaturalLanguageToOperations } from '@/lib/gemini';
import { parseRequestSchema } from '@/lib/schema';
import {
	deleteEventById,
	getEventsByUserId,
	issueSubscriptionToken,
	saveEvent,
	updateEventById,
} from '@/lib/storage';
import type {
	CalendarEvent,
	EventUpdateInput,
	ParseOperationResult,
} from '@/lib/types';

const TZ_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getTzFormatter(timezone: string): Intl.DateTimeFormat {
	const cached = TZ_FORMATTER_CACHE.get(timezone);
	if (cached) {
		return cached;
	}

	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});

	TZ_FORMATTER_CACHE.set(timezone, formatter);
	return formatter;
}

function getTimezoneOffsetMs(timezone: string, utcDate: Date): number {
	const formatter = getTzFormatter(timezone);
	const parts = formatter.formatToParts(utcDate);

	const valueByType: Record<string, string> = {};
	for (const part of parts) {
		if (part.type !== 'literal') {
			valueByType[part.type] = part.value;
		}
	}

	const asUtc = Date.UTC(
		Number(valueByType.year),
		Number(valueByType.month) - 1,
		Number(valueByType.day),
		Number(valueByType.hour),
		Number(valueByType.minute),
		Number(valueByType.second)
	);

	return asUtc - utcDate.getTime();
}

function coerceIsoToTimezoneUtc(inputIso: string, timezone: string): string {
	const matched = inputIso.match(
		/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
	);

	if (!matched) {
		throw new Error(`Invalid ISO datetime from AI: ${inputIso}`);
	}

	const [, year, month, day, hour, minute, second] = matched;
	const localMillis = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute),
		Number(second ?? '0')
	);

	let utcMillis = localMillis;
	for (let index = 0; index < 3; index += 1) {
		const offset = getTimezoneOffsetMs(timezone, new Date(utcMillis));
		utcMillis = localMillis - offset;
	}

	return new Date(utcMillis).toISOString();
}

function normalizeText(value: string): string {
	return value?.trim().replace(/\s+/g, ' ');
}

function normalizeRrule(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const normalized = value.trim();
	if (!normalized || /^null$/i.test(normalized) || /^none$/i.test(normalized)) {
		return undefined;
	}

	return normalized;
}

function isSameEvent(a: CalendarEvent, b: CalendarEvent): boolean {
	return (
		a.userId === b.userId &&
		normalizeText(a.summary) === normalizeText(b.summary) &&
		a.startTime === b.startTime &&
		a.endTime === b.endTime &&
		normalizeText(a.location) === normalizeText(b.location) &&
		normalizeText(a.description) === normalizeText(b.description) &&
		a.isAllDay === b.isAllDay &&
		normalizeRrule(a.rrule) === normalizeRrule(b.rrule)
	);
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const parsedRequest = parseRequestSchema.safeParse(body);

		if (!parsedRequest.success) {
			return NextResponse.json(
				{
					error: 'Invalid request payload.',
					details: parsedRequest.error.flatten(),
				},
				{ status: 400 }
			);
		}

		const { userId, text, timezone } = parsedRequest.data;
		const existingEvents = await getEventsByUserId(userId);
		const aiBatch = await parseNaturalLanguageToOperations(
			text,
			timezone,
			existingEvents
		);
		const eventById = new Map(existingEvents.map((item) => [item.id, item]));
		const results: ParseOperationResult[] = [];

		for (const operation of aiBatch.operations) {
			if (operation.action === 'create') {
				if (
					!operation.event?.summary ||
					!operation.event?.startTime ||
					!operation.event?.endTime
				) {
					results.push({
						action: 'create',
						success: false,
						error: 'AI create operation missing required event fields.',
					});
					continue;
				}

				const now = new Date().toISOString();
				const normalizedStartTime = coerceIsoToTimezoneUtc(
					operation.event.startTime,
					timezone
				);
				const normalizedEndTime = coerceIsoToTimezoneUtc(
					operation.event.endTime,
					timezone
				);

				if (
					new Date(normalizedStartTime).getTime() >=
					new Date(normalizedEndTime).getTime()
				) {
					results.push({
						action: 'create',
						success: false,
						error: 'Invalid event time range after timezone normalization.',
					});
					continue;
				}

				const newEvent: CalendarEvent = {
					id: createId(),
					userId,
					summary: operation.event.summary,
					startTime: normalizedStartTime,
					endTime: normalizedEndTime,
					description: operation.event.description ?? '',
					location: operation.event.location ?? '',
					isAllDay: Boolean(operation.event.isAllDay),
					rrule: normalizeRrule(operation.event.rrule),
					createdAt: now,
					updatedAt: now,
				};

				const duplicatedEvent = Array.from(eventById.values()).find((item) =>
					isSameEvent(item, newEvent)
				);
				const savedEvent = duplicatedEvent ?? newEvent;

				if (!duplicatedEvent) {
					await saveEvent(newEvent);
					eventById.set(newEvent.id, newEvent);
				}

				results.push({
					action: 'create',
					success: true,
					event: savedEvent,
					deduplicated: Boolean(duplicatedEvent),
				});
				continue;
			}

			if (operation.action === 'update') {
				const targetEventId = operation.targetEventId;
				if (!targetEventId) {
					results.push({
						action: 'update',
						success: false,
						error: 'AI update operation missing targetEventId.',
					});
					continue;
				}

				if (!operation.event) {
					results.push({
						action: 'update',
						success: false,
						error: 'AI update operation missing event patch fields.',
					});
					continue;
				}

				const normalizedStartTime =
					'startTime' in operation.event && operation.event.startTime
						? coerceIsoToTimezoneUtc(operation.event.startTime, timezone)
						: undefined;
				const normalizedEndTime =
					'endTime' in operation.event && operation.event.endTime
						? coerceIsoToTimezoneUtc(operation.event.endTime, timezone)
						: undefined;

				if (normalizedStartTime && normalizedEndTime) {
					if (
						new Date(normalizedStartTime).getTime() >=
						new Date(normalizedEndTime).getTime()
					) {
						results.push({
							action: 'update',
							success: false,
							error: 'Invalid event time range after timezone normalization.',
						});
						continue;
					}
				}

				const updatePayload: EventUpdateInput = {};
				if ('summary' in operation.event) {
					updatePayload.summary = operation.event.summary;
				}
				if ('startTime' in operation.event) {
					updatePayload.startTime = normalizedStartTime;
				}
				if ('endTime' in operation.event) {
					updatePayload.endTime = normalizedEndTime;
				}
				if ('location' in operation.event) {
					updatePayload.location = operation.event.location;
				}
				if ('description' in operation.event) {
					updatePayload.description = operation.event.description;
				}
				if ('isAllDay' in operation.event) {
					updatePayload.isAllDay = operation.event.isAllDay;
				}
				if ('rrule' in operation.event) {
					updatePayload.rrule = normalizeRrule(operation.event.rrule);
				}

				if (Object.keys(updatePayload).length === 0) {
					results.push({
						action: 'update',
						success: false,
						error: 'AI update operation has no effective fields to update.',
					});
					continue;
				}

				const updatedEvent = await updateEventById(
					userId,
					targetEventId,
					updatePayload
				);
				if (!updatedEvent) {
					results.push({
						action: 'update',
						success: false,
						error: 'Target event not found for update.',
					});
					continue;
				}

				eventById.set(updatedEvent.id, updatedEvent);
				results.push({
					action: 'update',
					success: true,
					event: updatedEvent,
				});
				continue;
			}

			if (operation.action === 'delete') {
				const targetEventId = operation.targetEventId;
				if (!targetEventId) {
					results.push({
						action: 'delete',
						success: false,
						error: 'AI delete operation missing targetEventId.',
					});
					continue;
				}

				const deleted = await deleteEventById(userId, targetEventId);
				if (!deleted) {
					results.push({
						action: 'delete',
						success: false,
						error: 'Target event not found for delete.',
					});
					continue;
				}

				eventById.delete(targetEventId);
				results.push({
					action: 'delete',
					success: true,
					deletedEventId: targetEventId,
				});
			}
		}

		const token = await issueSubscriptionToken(userId);
		const successCount = results.filter((item) => item.success).length;
		const failureCount = results.length - successCount;
		const firstResult = results[0] ?? null;

		return NextResponse.json({
			results,
			summary: {
				total: results.length,
				success: successCount,
				failed: failureCount,
			},
			action: firstResult?.action ?? null,
			event: firstResult?.event ?? null,
			deletedEventId: firstResult?.deletedEventId ?? null,
			deduplicated: firstResult?.deduplicated ?? false,
			token,
			subscriptionUrl: `/api/calendar/${token}.ics`,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: 'Failed to parse schedule text.',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}

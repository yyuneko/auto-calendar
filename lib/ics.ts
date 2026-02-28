import ical, { ICalCalendarMethod } from 'ical-generator';
import type { CalendarEvent } from '@/lib/types';

const TZ = 'Asia/Shanghai';

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

function buildDedupKey(event: CalendarEvent): string {
	return [
		event.userId,
		normalizeText(event.summary),
		event.startTime,
		event.endTime,
		normalizeText(event.location),
		normalizeText(event.description),
		event.isAllDay ? '1' : '0',
		normalizeRrule(event.rrule) ?? '',
	].join('||');
}

export function generateIcs(
	events: CalendarEvent[],
	calendarName: string
): string {
	const calendar = ical({
		name: calendarName,
		method: ICalCalendarMethod.PUBLISH,
		timezone: TZ,
		prodId: '//auto-calendar//subscription//CN',
	});

	calendar.x('X-PUBLISHED-TTL', 'PT15M');

	const uniqueEvents = new Map<string, CalendarEvent>();
	for (const event of events) {
		const key = buildDedupKey(event);
		if (!uniqueEvents.has(key)) {
			uniqueEvents.set(key, event);
		}
	}

	for (const event of uniqueEvents.values()) {
		const normalizedRrule = normalizeRrule(event.rrule);
		const item = calendar.createEvent({
			id: event.id,
			start: new Date(event.startTime),
			end: new Date(event.endTime),
			summary: event.summary,
			description: event.description,
			location: event.location,
			timezone: TZ,
			allDay: event.isAllDay,
		});

		if (normalizedRrule) {
			item.repeating(normalizedRrule);
		}
	}

	return calendar.toString();
}

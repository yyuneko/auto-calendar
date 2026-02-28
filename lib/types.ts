export type CalendarEvent = {
	id: string;
	userId: string;
	summary: string;
	startTime: string;
	endTime: string;
	description: string;
	location: string;
	isAllDay: boolean;
	rrule?: string;
	createdAt: string;
	updatedAt: string;
};

export type SubscriptionToken = {
	token: string;
	userId: string;
	createdAt: string;
};

export type ParsedEventInput = {
	summary: string;
	startTime: string;
	endTime: string;
	location: string;
	description: string;
	isAllDay?: boolean;
	rrule?: string;
};

export type EventUpdateInput = {
	summary?: string;
	startTime?: string;
	endTime?: string;
	location?: string;
	description?: string;
	isAllDay?: boolean;
	rrule?: string;
};

export type AICalendarOperation = {
	action: 'create' | 'update' | 'delete';
	targetEventId?: string;
	event?: Partial<ParsedEventInput>;
};

export type AICalendarOperationBatch = {
	operations: AICalendarOperation[];
};

export type ParseOperationResult = {
	action: 'create' | 'update' | 'delete';
	success: boolean;
	event?: CalendarEvent | null;
	deletedEventId?: string | null;
	deduplicated?: boolean;
	error?: string;
};

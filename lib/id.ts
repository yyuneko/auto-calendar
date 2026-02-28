import { randomUUID } from 'crypto';

export function createId(): string {
	return randomUUID();
}

export function createToken(): string {
	return randomUUID().replaceAll('-', '');
}

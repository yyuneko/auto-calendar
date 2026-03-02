import { getServerSession, type NextAuthOptions } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import GoogleProvider from 'next-auth/providers/google';

function buildProviders(): NextAuthOptions['providers'] {
	const providers: NextAuthOptions['providers'] = [];

	if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
		providers.push(
			GoogleProvider({
				clientId: process.env.AUTH_GOOGLE_ID,
				clientSecret: process.env.AUTH_GOOGLE_SECRET,
			})
		);
	}

	if (process.env.AUTH_EMAIL_SERVER && process.env.AUTH_EMAIL_FROM) {
		providers.push(
			EmailProvider({
				server: process.env.AUTH_EMAIL_SERVER,
				from: process.env.AUTH_EMAIL_FROM,
			})
		);
	}

	return providers;
}

export const authOptions: NextAuthOptions = {
	providers: buildProviders(),
	session: {
		strategy: 'jwt',
	},
	pages: {
		signIn: '/',
	},
	callbacks: {
		async session({ session, token }) {
			if (session.user && token.sub) {
				(session.user as { id?: string }).id = token.sub;
			}
			return session;
		},
	},
};

export async function getSessionUserId(): Promise<string | null> {
	const session = await getServerSession(authOptions);
	return (session?.user as { id?: string } | undefined)?.id ?? null;
}

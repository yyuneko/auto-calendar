'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ClientSafeProvider,
  getProviders,
  signIn,
  signOut,
  useSession,
} from 'next-auth/react';

type ParseResponse = {
  event?: {
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
  token?: string;
  subscriptionUrl?: string;
  error?: string;
  message?: string;
};

export default function HomePage() {
  const GEMINI_API_KEY_STORAGE_KEY = 'auto-calendar:gemini-api-key';
  const { data: session, status } = useSession();
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [text, setText] = useState('从今天开始，每三个月给猫咪做外驱，每个月给狗子内驱；今天晚上提醒我给妈妈打电话；下周二下午三点开会；每天下午两点吃药；每年八月八日是爸爸生日；每周五晚上八点和朋友吃饭');
  const [timezone, setTimezone] = useState<string>();
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string>('');

  const timezoneOptions = useMemo(() => {
    if (typeof Intl.supportedValuesOf === 'function') {
      const timeZones = Intl.supportedValuesOf('timeZone');
      if (timeZones.length > 0) {
        return timeZones;
      }
    }

    return [
      'Asia/Shanghai',
      'Asia/Tokyo',
      'Asia/Singapore',
      'Europe/London',
      'Europe/Berlin',
      'America/New_York',
      'America/Los_Angeles',
      'UTC',
    ];
  }, []);

  useEffect(() => {
    const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (systemTimeZone && timezoneOptions.includes(systemTimeZone)) {
      setTimezone(systemTimeZone);
      return;
    }

    if (systemTimeZone) {
      setTimezone(systemTimeZone);
    }
  }, [timezoneOptions]);

  useEffect(() => {
    try {
      const cachedApiKey = localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) ?? '';
      if (cachedApiKey) {
        setGeminiApiKey(cachedApiKey);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (geminiApiKey.trim()) {
        localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, geminiApiKey.trim());
      } else {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
      }
    } catch {}
  }, [geminiApiKey]);

  useEffect(() => {
    let active = true;

    getProviders()
      .then((resolvedProviders) => {
        if (!active) {
          return;
        }

        setProviders(resolvedProviders ?? {});
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setProviders({});
      });

    return () => {
      active = false;
    };
  }, []);

  const subscriptionLink = useMemo(() => {
    if (!result?.subscriptionUrl) {
      return '';
    }

    if (typeof window === 'undefined') {
      return result.subscriptionUrl;
    }

    return `${window.location.origin}${result.subscriptionUrl}`;
  }, [result?.subscriptionUrl]);

  const providerIds = useMemo(() => new Set(Object.keys(providers)), [providers]);
  const hasAuthProvider = providerIds.size > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status !== 'authenticated') {
      setError('请先登录后再解析日程。');
      return;
    }

    if (!geminiApiKey.trim()) {
      setError('请先填写 Gemini API Key。');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: geminiApiKey.trim(),
          text,
          timezone,
        }),
      });

      const data = (await response.json()) as ParseResponse;

      if (!response.ok) {
        setError(data.message ?? data.error ?? '请求失败');
        setResult(data);
        return;
      }

      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '请求异常');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Auto Calendar 测试页</h1>
      <p>提交自然语言后，服务会解析并生成可订阅的 .ics 链接。</p>

      <p>
        {status === 'authenticated' ? (
          <>
            当前登录：{session?.user?.email ?? session?.user?.name ?? '已登录用户'}{' '}
            <button type='button' onClick={() => signOut()}>
              退出登录
            </button>
          </>
        ) : (
          <>
            当前未登录。{' '}
            {providerIds.has('google') ? (
              <>
                <button type='button' onClick={() => signIn('google')}>
                  使用 Google 登录
                </button>{' '}
              </>
            ) : null}
            {providerIds.has('email') ? (
              <button type='button' onClick={() => signIn('email')}>
                邮箱魔法链接登录
              </button>
            ) : null}
            {!hasAuthProvider ? '未检测到可用登录方式，请检查 AUTH_* 配置。' : null}
          </>
        )}
      </p>

      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Gemini API Key（仅保存在当前浏览器本地）
            <br />
            <input
              type='password'
              value={geminiApiKey}
              onChange={(event) => setGeminiApiKey(event.target.value)}
              autoComplete='off'
              required
            />
          </label>
        </p>

        <p>
          <label>
            时区
            <br />
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              required
            >
              {timezoneOptions.map((timeZoneItem) => (
                <option key={timeZoneItem} value={timeZoneItem}>
                  {timeZoneItem}
                </option>
              ))}
            </select>
          </label>
        </p>

        <p>
          <label>
            自然语言输入
            <br />
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              required
            />
          </label>
        </p>

        <button type='submit' disabled={loading}>
          {loading ? '解析中...' : '解析并生成订阅链接'}
        </button>
      </form>

      {error ? <p>错误：{error}</p> : null}

      {subscriptionLink ? (
        <p>
          订阅链接：
          <a href={subscriptionLink} target='_blank' rel='noreferrer'>
            {subscriptionLink}
          </a>
        </p>
      ) : null}

      {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
    </main>
  );
}

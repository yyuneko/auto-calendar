'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

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
  const [userId, setUserId] = useState('user_demo');
  const [text, setText] = useState('从今天开始，每三个月给猫咪做外驱，每个月给狗子内驱；今天晚上提醒我给妈妈打电话；下周二下午三点开会；每天下午两点吃药；每年八月八日是爸爸生日；每周五晚上八点和朋友吃饭');
  const [timezone, setTimezone] = useState<string>();
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

  const subscriptionLink = useMemo(() => {
    if (!result?.subscriptionUrl) {
      return '';
    }

    if (typeof window === 'undefined') {
      return result.subscriptionUrl;
    }

    return `${window.location.origin}${result.subscriptionUrl}`;
  }, [result?.subscriptionUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
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

      <form onSubmit={handleSubmit}>
        <p>
          <label>
            用户 ID
            <br />
            <input
              type='text'
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
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

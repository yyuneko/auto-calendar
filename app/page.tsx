'use client';

import { FormEvent, useMemo, useState } from 'react';

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
  const [text, setText] = useState('下周三下午两点在瑞幸咖啡和老王开会一小时');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string>('');

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
            <input
              type='text'
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              required
            />
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

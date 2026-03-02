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

type Locale = 'zh-CN' | 'en-US';

const I18N: Record<Locale, {
  heroSubtitle: string;
  loggedIn: string;
  currentUser: string;
  signOut: string;
  loginGoogle: string;
  loginEmail: string;
  noProvider: string;
  geminiLabel: string;
  timezoneLabel: string;
  textLabel: string;
  clear: string;
  submit: string;
  submitting: string;
  errorPrefix: string;
  subscriptionLabel: string;
  needLogin: string;
  needApiKey: string;
  requestFailed: string;
  requestError: string;
  sampleText: string;
  langZh: string;
  langEn: string;
  basicConfig: string;
  loginAndConfig: string;
  collapseConfig: string;
  expandConfig: string;
}> = {
  'zh-CN': {
    heroSubtitle: '用一句话整理日程，立即生成可订阅链接。',
    loggedIn: '已登录：',
    currentUser: '当前用户',
    signOut: '退出登录',
    loginGoogle: '使用 Google 登录',
    loginEmail: '邮箱魔法链接登录',
    noProvider: '未检测到可用登录方式，请检查 AUTH_* 配置。',
    geminiLabel: 'Gemini API Key（仅保存在当前浏览器本地）',
    timezoneLabel: '时区',
    textLabel: '自然语言输入',
    clear: '清除',
    submit: '生成订阅链接',
    submitting: '处理中...',
    errorPrefix: '错误：',
    subscriptionLabel: '订阅链接：',
    needLogin: '请先登录后再解析日程。',
    needApiKey: '请先填写 Gemini API Key。',
    requestFailed: '请求失败',
    requestError: '请求异常',
    sampleText:
      '从今天开始，每三个月给猫咪做外驱，每个月给狗子内驱；今天晚上提醒我给妈妈打电话；下周二下午三点开会；每天下午两点吃药；每年八月八日是爸爸生日；每周五晚上八点和朋友吃饭',
    langZh: '中文',
    langEn: 'English',
    basicConfig: '基础配置',
    loginAndConfig: '登录与配置',
    collapseConfig: '收起',
    expandConfig: '展开',
  },
  'en-US': {
    heroSubtitle: 'Turn one sentence into a subscription-ready calendar link.',
    loggedIn: 'Signed in: ',
    currentUser: 'Current user',
    signOut: 'Sign out',
    loginGoogle: 'Sign in with Google',
    loginEmail: 'Email magic link',
    noProvider: 'No login provider detected. Please check AUTH_* configuration.',
    geminiLabel: 'Gemini API Key (stored only in this browser)',
    timezoneLabel: 'Time zone',
    textLabel: 'Natural language input',
    clear: 'Clear',
    submit: 'Generate subscription link',
    submitting: 'Processing...',
    errorPrefix: 'Error: ',
    subscriptionLabel: 'Subscription URL: ',
    needLogin: 'Please sign in before parsing schedules.',
    needApiKey: 'Please enter Gemini API Key first.',
    requestFailed: 'Request failed',
    requestError: 'Request error',
    sampleText:
      'Starting today, remind me every 3 months for cat flea treatment and every month for dog deworming; remind me to call mom tonight; meeting next Tuesday at 3 PM; take medicine every day at 2 PM; dad\'s birthday is August 8; dinner with friends every Friday at 8 PM.',
    langZh: '中文',
    langEn: 'English',
    basicConfig: 'Basic settings',
    loginAndConfig: 'Login & settings',
    collapseConfig: 'Collapse',
    expandConfig: 'Expand',
  },
};

function detectSystemLocale(): Locale {
  if (typeof navigator === 'undefined') {
    return 'zh-CN';
  }

  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export default function HomePage() {
  const GEMINI_API_KEY_STORAGE_KEY = 'auto-calendar:gemini-api-key';
  const LOCALE_STORAGE_KEY = 'auto-calendar:locale';
  const TEXT_SAMPLE_INITIALIZED_KEY = 'auto-calendar:text-sample-initialized';
  const { data: session, status } = useSession();
  const [locale, setLocale] = useState<Locale>('zh-CN');
  const [isLocaleReady, setIsLocaleReady] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(false);
  const [hasManualConfigToggle, setHasManualConfigToggle] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [text, setText] = useState('');
  const [timezone, setTimezone] = useState<string>();
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string>('');
  const copy = I18N[locale];

  useEffect(() => {
    try {
      const cachedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (cachedLocale === 'zh-CN' || cachedLocale === 'en-US') {
        setLocale(cachedLocale);
        setIsLocaleReady(true);
        return;
      }
    } catch {}

    setLocale(detectSystemLocale());
    setIsLocaleReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const applyMatches = (matches: boolean) => setIsMobileView(matches);

    applyMatches(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => applyMatches(event.matches);
    mediaQuery.addEventListener('change', listener);

    return () => {
      mediaQuery.removeEventListener('change', listener);
    };
  }, []);

  useEffect(() => {
    if (!isLocaleReady) {
      return;
    }

    try {
      const initialized = localStorage.getItem(TEXT_SAMPLE_INITIALIZED_KEY);
      if (initialized === '1') {
        return;
      }
    } catch {}

    setText(I18N[locale].sampleText);

    try {
      localStorage.setItem(TEXT_SAMPLE_INITIALIZED_KEY, '1');
    } catch {}
  }, [TEXT_SAMPLE_INITIALIZED_KEY, isLocaleReady, locale]);

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

  const defaultTimezone = useMemo(() => {
    const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (systemTimeZone) {
      return systemTimeZone;
    }

    if (timezoneOptions.includes('UTC')) {
      return 'UTC';
    }

    return timezoneOptions[0] ?? 'UTC';
  }, [timezoneOptions]);

  useEffect(() => {
    setTimezone((prev) => (prev && prev.trim() ? prev : defaultTimezone));
  }, [defaultTimezone]);

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
  const shouldShowResult = Boolean(result || subscriptionLink || error);

  const accountContent =
    status === 'authenticated' ? (
      <div className='account-text'>
        <span className='account-status'>
          {copy.loggedIn}
          {session?.user?.email ?? session?.user?.name ?? copy.currentUser}
        </span>
        <span className='account-actions'>
          <button
            className='account-action'
            type='button'
            onClick={() => signOut()}
          >
            {copy.signOut}
          </button>
        </span>
      </div>
    ) : (
      <div className='account-text'>
        <span className='account-actions'>
          {providerIds.has('google') ? (
            <button
              className='account-action'
              type='button'
              onClick={() => signIn('google')}
            >
              {copy.loginGoogle}
            </button>
          ) : null}
          {providerIds.has('email') ? (
            <button
              className='account-action'
              type='button'
              onClick={() => signIn('email')}
            >
              {copy.loginEmail}
            </button>
          ) : null}
        </span>
        {!hasAuthProvider ? copy.noProvider : null}
      </div>
    );

  const basicConfigFields = (
    <>
      <p className='form-item'>
        <label className='form-label'>
          {copy.geminiLabel}
          <br />
          <span className='input-wrap'>
            <input
              className='form-input'
              type='password'
              value={geminiApiKey}
              onChange={(event) => setGeminiApiKey(event.target.value)}
              autoComplete='off'
              required
            />
            <button
              className='clear-icon-button'
              type='button'
              onClick={() => setGeminiApiKey('')}
              aria-label={copy.clear}
              title={copy.clear}
            >
              ×
            </button>
          </span>
        </label>
      </p>

      <p className='form-item'>
        <label className='form-label'>
          {copy.timezoneLabel}
          <br />
          <span className='input-wrap'>
            <input
              className='form-input'
              type='text'
              list='timezone-options'
              value={timezone ?? ''}
              onChange={(event) => setTimezone(event.target.value)}
              onBlur={(event) => {
                if (!event.target.value.trim()) {
                  setTimezone(defaultTimezone);
                }
              }}
              autoComplete='off'
              required
            />
            <datalist id='timezone-options'>
              {timezoneOptions.map((timeZoneItem) => (
                <option key={timeZoneItem} value={timeZoneItem} />
              ))}
            </datalist>
          </span>
        </label>
      </p>
    </>
  );

  useEffect(() => {
    const hasGeminiApiKey = geminiApiKey.length > 0;
    const hasTimezone = Boolean(timezone);

    if (!isMobileView) {
      setIsConfigCollapsed(false);
      setHasManualConfigToggle(false);
      return;
    }

    if (!hasGeminiApiKey || !hasTimezone) {
      setIsConfigCollapsed(false);
      return;
    }

    if (!hasManualConfigToggle) {
      setIsConfigCollapsed(true);
    }
  }, [geminiApiKey, hasManualConfigToggle, isMobileView, timezone]);

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    } catch {}
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status !== 'authenticated') {
      setError(copy.needLogin);
      return;
    }

    if (!geminiApiKey.trim()) {
      setError(copy.needApiKey);
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
          locale,
          text,
          timezone,
        }),
      });

      const data = (await response.json()) as ParseResponse;

      if (!response.ok) {
        setError(data.message ?? data.error ?? copy.requestFailed);
        setResult(data);
        return;
      }

      setResult(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : copy.requestError,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className='app-shell'>
      <section className='hero'>
        <div className='hero-head'>
          <h1 className='hero-title'>Auto Calendar</h1>
          <div className='locale-switch'>
            <button
              className={`locale-button ${locale === 'zh-CN' ? 'active' : ''}`}
              type='button'
              onClick={() => handleLocaleChange('zh-CN')}
            >
              {copy.langZh}
            </button>
            <button
              className={`locale-button ${locale === 'en-US' ? 'active' : ''}`}
              type='button'
              onClick={() => handleLocaleChange('en-US')}
            >
              {copy.langEn}
            </button>
          </div>
        </div>
        <p className='hero-subtitle'>{copy.heroSubtitle}</p>
      </section>

      <section className='surface account-bar desktop-account'>
        {accountContent}
      </section>

      <section className='surface form-surface'>
        <form className='parse-form' onSubmit={handleSubmit}>
          {isMobileView ? (
            <button
              className='config-toggle'
              type='button'
              onClick={() => {
                setHasManualConfigToggle(true);
                setIsConfigCollapsed((prev) => !prev);
              }}
            >
              <span>{copy.loginAndConfig}</span>
              <span>{isConfigCollapsed ? copy.expandConfig : copy.collapseConfig}</span>
            </button>
          ) : null}

          {isMobileView ? (
            <div className={`basic-config-panel ${isConfigCollapsed ? 'collapsed' : ''}`}>
              <section className='surface account-bar mobile-account'>
                {accountContent}
              </section>
              <div className='basic-config'>
                {basicConfigFields}
              </div>
            </div>
          ) : (
            <div className='basic-config'>
              {basicConfigFields}
            </div>
          )}

          <p className='form-item'>
            <label className='form-label'>
              {copy.textLabel}
              <br />
              <span className='input-wrap'>
                <textarea
                  className='form-textarea'
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={5}
                  required
                />
                <button
                  className='clear-icon-button clear-icon-top'
                  type='button'
                  onClick={() => setText('')}
                  aria-label={copy.clear}
                  title={copy.clear}
                >
                  ×
                </button>
              </span>
            </label>
          </p>

          <button className='submit-button' type='submit' disabled={loading}>
            {loading ? copy.submitting : copy.submit}
          </button>
        </form>
      </section>

      {shouldShowResult ? (
        <section className='surface result-surface'>
          {error ? (
            <p className='result-error'>
              {copy.errorPrefix}
              {error}
            </p>
          ) : null}

          {subscriptionLink ? (
            <p className='result-link'>
              {copy.subscriptionLabel}
              <a href={subscriptionLink} target='_blank' rel='noreferrer'>
                {subscriptionLink}
              </a>
            </p>
          ) : null}

          {result ? (
            <pre className='result-json'>{JSON.stringify(result, null, 2)}</pre>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

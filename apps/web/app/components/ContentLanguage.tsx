import { useLocale } from '../lib/i18n';
export function ContentLanguage({ content }: { content: { contentLanguage?: { status: string }; title?: string; summary?: string | null } }) {
  const locale=useLocale();
  if(locale !== 'en' || content.contentLanguage?.status === 'translated') return null;
  if(!content.contentLanguage && !/[\p{Script=Han}]/u.test(`${content.title??''}${content.summary??''}`)) return null;
  return <p className="my-2 text-xs text-ink-4" lang="en">English edition pending · Original content</p>;
}

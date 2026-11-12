/** The essays' interface copy: Chinese keys, as the pages are written, with their English. */
export const ENGLISH: Readonly<Record<string, string>> = {
  "长文": "Essays",
  "{0} 的署名长文": "Essays by {0}",
  "{0} 的署名长文：根据作者笔记由 AI 起草，作者修改并审定。": "Signed essays by {0}: drafted with AI from the author's notes, edited and approved by the author.",
  "关于加速、智能与人类未来的署名长文，中英两版同时发布。": "Signed long-form essays on acceleration, intelligence and the human future, published in English and Chinese.",
  "还没有发布的长文。": "No essays published yet.",
  "第一篇发布后会出现在这里；可以先订阅 RSS。": "The first one will appear here. You can subscribe to the RSS feed now.",
  "RSS 订阅": "RSS feed",
  "根据作者笔记由 AI 起草，作者修改并审定。": "Drafted with AI from the author's notes; edited and approved by the author.",
  "essays.byline": "By",
  "更新于 {0}": "Updated {0}",
  "图片来源：": "Image: ",
  "全部长文": "All essays",
  "这篇长文已撤下": "This essay was withdrawn",
  "作者撤下了这篇文章，它不再公开。": "The author has taken this essay down. It is no longer public.",
};

/** Keys that would read the same as another page's copy carry the module's prefix. */
export const CHINESE: Readonly<Record<string, string>> = {
  "essays.byline": "作者",
};

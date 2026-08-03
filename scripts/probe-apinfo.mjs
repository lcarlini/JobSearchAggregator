const urls = [
  "https://www.apinfo.com/apinfo/inc/list4.cfm",
  "https://www.apinfo.com/",
];

for (const url of urls) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "JobSearchAggregator/1.0",
      Accept: "text/html",
    },
  });
  const html = await res.text();
  console.log("\n===", url, "status", res.status, "len", html.length);

  const jobs = [];
  const re =
    /href="([^"]*list44\.cfm[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const title = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title || title.length < 3) continue;
    let href = m[1].replace(/&amp;/g, "&");
    if (!href.startsWith("http")) {
      href = href.startsWith("/")
        ? `https://www.apinfo.com${href}`
        : `https://www.apinfo.com/apinfo/inc/${href}`;
    }
    jobs.push({ title, url: href });
  }
  console.log("list44 links", jobs.length);
  console.log(jobs.slice(0, 8));

  const ho = (html.match(/Home Office|Remoto|remoto/gi) || []).length;
  console.log("remote mentions", ho);
}

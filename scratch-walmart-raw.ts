const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const res = await fetch('https://www.walmart.com/search?q=laptop&sort=best_match', { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' } })
const text = await res.text()
console.log('status', res.status, 'len', text.length)
console.log(text.slice(0, 2000))

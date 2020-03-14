const cheerio = require('cheerio'); // 解析器

const axios = require('./axios'); // 数据请求
const { hashNameIntoInt, insertStr, hasLetter } = require('./utils');
const scrapeWorkMetadataFromHVDB = require('./hvdb');

/**
 * Scrapes work metadata from public DLsite page HTML.
 * @param {number} id Work id.
 * @param {String} language 标签语言，'ja-jp', 'zh-tw' or 'zh-cn'，默认'zh-cn'
 */
const scrapeWorkMetadataFromDLsite = (id, language) => new Promise((resolve, reject) => {
  const rjcode = (`000000${id}`).slice(-6);
  const url = `https://www.dlsite.com/maniax/work/=/product_id/RJ${rjcode}.html`;

  const work = { id, tags: [], vas: [] };
  let AGE_RATINGS, VA, GENRE, RELEASE, COOKIE_LOCALE;
  switch(language) {
    case 'ja-jp':
      COOKIE_LOCALE = 'locale=ja-jp'
      AGE_RATINGS = '年齢指定';
      GENRE = 'ジャンル';
      VA = '声優';
      RELEASE = '販売日';
      break;
    case 'zh-tw':
      COOKIE_LOCALE = 'locale=zh-tw'
      AGE_RATINGS = '年齡指定';
      GENRE = '分類';
      VA = '聲優';
      RELEASE = '販賣日';
      break;
    default:
      COOKIE_LOCALE = 'locale=zh-cn'
      AGE_RATINGS = '年龄指定';
      GENRE = '分类';
      VA = '声优';
      RELEASE = '贩卖日';
  }

  axios.get(url, {
    headers: { "cookie": COOKIE_LOCALE } // 自定义请求头
  })
    .then(response => response.data)
    .then((data) => { // 解析
      // 转换成 jQuery 对象
      const $ = cheerio.load(data);

      // 标题
      work.title = $(`a[href="${url}"]`).text();
  
      // 社团
      const circleUrl = $('span[class="maker_name"]').children('a').attr('href');
      const circleName = $('span[class="maker_name"]').children('a').text();
      work.circle = (circleUrl && circleName)
        ? { id: parseInt(circleUrl.substr(-10,5)), name: circleName }
        : {};

      // NSFW
      const R18 = $('#work_outline').children('tbody').children('tr').children('th')
        .filter(function() {
          return $(this).text() === AGE_RATINGS;
        }).parent().children('td').text();
      work.nsfw = R18 === '18禁';

      // 贩卖日 (YYYY-MM-DD)
      const release = $('#work_outline').children('tbody').children('tr').children('th')
        .filter(function() {
          return $(this).text() === RELEASE;
        }).parent().children('td').text().replace(/[^0-9]/ig,'');
      work.release = (release.length === 8)
        ? insertStr(insertStr(release, 4, '-'), 7, '-')
        : '';
        
      // 标签
      $('#work_outline').children('tbody').children('tr').children('th')
        .filter(function() {
          return $(this).text() === GENRE;
        }).parent().children('td').children('div').children('a').each(function() {
          const tagUrl = $(this).attr('href');
          const tagName = $(this).text();
          work.tags.push({
            id: parseInt(tagUrl.substr(-19,3)),
            name: tagName
          });
        });
      
      // 声优
      $('#work_outline').children('tbody').children('tr').children('th')
        .filter(function() {
          return $(this).text() === VA;
        }).parent().children('td').children('a').each(function() {
          const vaName = $(this).text();
          work.vas.push({
            id: hashNameIntoInt(vaName),
            name: vaName
          });
        });

      if (work.tags.length === 0 && work.vas.length === 0) {
        reject(new Error('Couldn\'t parse data from DLsite work page.'));
      }
    })
    .then(() => {
      if (work.vas.length === 0) {  
        // 从 DLsite 抓不到声优信息时, 从 HVDB 抓取声优信息
        scrapeWorkMetadataFromHVDB(id)
          .then((metadata) => {
            if (metadata.vas.length <= 1) {
              // N/A
              work.vas = metadata.vas;
            } else {
              // 过滤掉英文的声优名
              metadata.vas.forEach(function(va) {
                if (!hasLetter(va.name)) {
                  work.vas.push(va);
                }
              });
            }
  
            resolve(work);
          })
          .catch((error) => {
            reject(new Error(error.message));
          });
      } else {
        resolve(work);
      } 
    })
    .catch((error) => {
      if (error.response) {
        // 请求已发出，但服务器响应的状态码不在 2xx 范围内
        reject(new Error(`Couldn't request work page HTML (${url}), received: ${error.response.status}.`));
      } else {
        reject(new Error(error.message));
      }
    });
});


module.exports = scrapeWorkMetadataFromDLsite;
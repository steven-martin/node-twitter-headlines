
/**
 * Module dependencies
 */

const jsonfile = require('jsonfile');
const moment = require('moment');
const twitter = require('./twitter.client');


/**
 * Headlines: constructor
 * Creates a new instance of Headlines.
 */

const Headlines = function Headlines(settings) {
  this.config = settings;
  this.flags = {};
  this.rateLimit = {};

  // load engine configuration in Headlines model
  this.config.engine = jsonfile.readFileSync(this.config.headlines_file);

  // init the headlines and category objects
  this.headlines = {};
  this.categories = {};
  this.categories.News = [];
  Object.keys(this.config.engine.categories).forEach((categoryID) => {
    this.categories[this.config.engine.categories[categoryID].category] = [];
  });
};
Headlines.prototype.config = {};
Headlines.prototype.flags = {};
Headlines.prototype.headlines = {};
Headlines.prototype.categories = {};
Headlines.prototype.rateLimit = {};


/**
 * collectSourceHeadlines: private function
 * This purpose of this method is process raw tweet json objects into a headline object.
 */
function collectSourceHeadlines(name, rawTweets, rules, config) {
  const headlines = [];
  Object.keys(rawTweets).forEach((tweet) => {
    const headline = {};

    // collect the source fields
    headline.source_name = ('name' in rawTweets[tweet].user) ? rawTweets[tweet].user.name : '';
    headline.source_photo = ('profile_image_url' in rawTweets[tweet].user) ? rawTweets[tweet].user.profile_image_url : '';

    // collect the article fields
    headline.article_link = (0 in rawTweets[tweet].entities.urls) ? rawTweets[tweet].entities.urls[0].expanded_url : '';
    headline.article_photo = ('extended_entities' in rawTweets[tweet]) ? rawTweets[tweet].extended_entities.media[0].media_url : '';

    // collect and tidy the article description
    headline.article_description = ('text' in rawTweets[tweet]) ? rawTweets[tweet].text : '';
    headline.article_description = headline.article_description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
    headline.article_description = headline.article_description.replace(/&amp;/, 'and');

    // collect the headline date
    headline.date = ('created_at' in rawTweets[tweet]) ? rawTweets[tweet].created_at : '';
    const timestamp = Date.parse(headline.date);
    headline.timestamp = timestamp;

    // collect and calculate the headline score
    const retweetCount = ('retweet_count' in rawTweets[tweet]) ? rawTweets[tweet].retweet_count : 0;
    const favoriteCount = ('favorite_count' in rawTweets[tweet] === true) ? rawTweets[tweet].favorite_count : 0;
    const timestampNow = moment(new Date(), 'YYYY-M-DD HH:mm:ss');
    const timestampThen = moment(new Date(timestamp), 'YYYY-M-DD HH:mm:ss');
    const ratingHoursAgo = moment(timestampNow).diff(timestampThen, 'hours');
    let reverseAgeScore = (200 - ratingHoursAgo);
    if (reverseAgeScore < 0) {
      reverseAgeScore = 0;
    }
    headline.score = parseInt(reverseAgeScore + (retweetCount / 10) + (favoriteCount / 5), 10);

    // collect the category information
    const categoryList = config.engine.categories;
    headline.category = 'News';
    headline.category_badge = 'default_badge';
    headline.tags = '';
    Object.keys(categoryList).forEach((category) => {
      const searchPattern = new RegExp(categoryList[category].search_pattern, 'i');
      if (searchPattern.test(headline.article_description)) {
        headline.category = categoryList[category].category;
        headline.category_badge = categoryList[category].badge;
        if (headline.tags === '') {
          headline.tags += categoryList[category].category;
        } else {
          headline.tags = `${headline.tags},${categoryList[category].category}`;
        }
      }
    });

    // check the headline against the Custom Rules
    let include = true;
    if (rules.default === 'exclude all') {
      include = false;
    }
    const customrules = rules.custom;
    Object.keys(customrules).forEach((rule) => {
      // We test to see if the 'contains' is true for the 'where'.
      const contains = new RegExp(customrules[rule].contains, 'i');
      let where = 'article_description';
      if (headline[customrules[rule].where] === 'source') {
        where = 'source_name';
      }
      const ruleResult = contains.test(headline[where]);
      if (ruleResult) {
        if (customrules[rule].action === 'force include') {
          include = true;
        }
        if (customrules[rule].action === 'force exclude') {
          include = false;
        }
      }
    });

    // check the headline against the Mandatory Rules
    if (headline.article_description === '') { include = false; }
    if (headline.article_link === '') { include = false; }
    if (headline.article_photo === '') { include = false; }

    // If Rules allow, Add this headline to headlines array
    if (include === true) {
      headlines.push(headline);
    }
  });

  return headlines;
}


/**
 * asyncLoop: private function
 * A reusable function for async looping through an array.
 */
async function asyncLoop(array, callback) {
  for (let index = 0; index < array.length; index += 1) {
    /* eslint-disable no-await-in-loop */
    await callback(array[index], index, array);
  }
}


/**
 * getHeadlines: private function
 * This purpose of this function is to collect the headlines and categories,
 * looping through each of the source files and processing each one.
 * Adding to the headlines and categories to the current Twitter-Headline instance
 * The headlines and categories are then sorted at the end.
 */
function getHeadlines(thisInstance) {
  return new Promise((() => {
    // Reset the headlines object in the current Twitter-Headlines instance
    /* eslint-disable no-param-reassign */
    thisInstance.headlines = [];

    // collecting the list of twitter sources from the instance config
    const { sources } = thisInstance.config.engine;

    // loop through each source, process the tweets into headlines
    const process = async () => {
      await asyncLoop(sources, async (source) => {
        /* eslint-disable max-len */
        await twitter.getTwitterList(source.owner_screen_name, source.slug, source.rules, thisInstance.config).then((res) => {
          // collects the headlines from the index source
          const thisSourceHeadlines = collectSourceHeadlines(res.slug, res.data, res.rules, thisInstance.config);
          // loops through each headline
          Object.keys(thisSourceHeadlines).forEach((thisSourceHeadlineID) => {
            // adds the current headline to thisInstance.headlines
            thisInstance.headlines.push(thisSourceHeadlines[thisSourceHeadlineID]);
            // adds the current headline to thisInstance.category, if it doesn't exist already
            let alreadyexists = false;
            const compareDescription1 = thisSourceHeadlines[thisSourceHeadlineID].article_description;
            Object.keys(thisInstance.categories[thisSourceHeadlines[thisSourceHeadlineID].category]).forEach((thisCategory) => {
              const compareDescription2 = thisInstance.categories[thisSourceHeadlines[thisSourceHeadlineID].category][thisCategory].article_description;
              if (compareDescription1 === compareDescription2) {
                alreadyexists = true;
              }
            });
            if (alreadyexists === false) {
              thisSourceHeadlines[thisSourceHeadlineID].score = null;
              thisInstance.categories[thisSourceHeadlines[thisSourceHeadlineID].category].push(thisSourceHeadlines[thisSourceHeadlineID]);
            }
          });
          // updates the current Twitter-Headline instance with the current Twitter rate limit
          /* eslint-disable no-param-reassign */
          thisInstance.rateLimit = res.rate_limit;
        });
      });

      // sort the headlines, based on the config setting
      if (thisInstance.config.engine.sort === 'top20') {
        thisInstance.headlines.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
      } else {
        thisInstance.headlines.sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));
      }
      // trim headlines to a max of 20
      if (thisInstance.headlines.length > 20) {
        thisInstance.headlines.length = 20;
      }
      // loop through each category...
      Object.keys(thisInstance.config.engine.categories).forEach((categoryID) => {
        // sort the category - only by timestamp
        thisInstance.categories[thisInstance.config.engine.categories[categoryID].category].sort((a, b) => parseFloat(b.timestamp) - parseFloat(a.timestamp));
        // trim category to a max of 20
        if (thisInstance.categories[thisInstance.config.engine.categories[categoryID].category].length > 20) {
          thisInstance.categories[thisInstance.config.engine.categories[categoryID].category].length = 20;
        }
      });
      // sort the default News category, based on the config setting
      thisInstance.categories.News.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
      // trim category to a max of 20
      if (thisInstance.categories.News.length > 20) {
        thisInstance.categories.News.length = 20;
      }
    };
    process();
  }));
}

/**
 * get: publc function
 * This function processes all of the twitter sources and produces the headlines and category data.
 */
Headlines.prototype.get = async function get() {
  getHeadlines(this);
};

module.exports = Headlines;

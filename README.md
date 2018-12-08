# Twitter Headlines for Node.js

An asynchronous 'engine' for creating News Headlines from your own Twitter Lists.

A [Twitter Lists](https://help.twitter.com/en/using-twitter/twitter-lists) is a curated group of Twitter accounts. You can create your own Lists or subscribe to Lists created by others. Viewing a List timeline will show you a stream of Tweets from only the accounts on that List.

Twitter Headlines allows you to take this feature a step further by combining multiple lists and adding additional 'rules' to ensure you a get a news stream of only the content you want to see.

Twitter Headlines then produces a JSON payload, which you to use in your own websites and applications. 

## Installation

```
npm install twitter-headlines
```

## Quick Start

You will need valid Twitter developer credentials in the form of a set of consumer and access tokens/keys, which you can obtain from [https://apps.twitter.com](https://apps.twitter.com).

## Creating a Instance

```
const page = new TwitterHeadlines({
  consumer_key: '',
  consumer_secret: '',
  access_token_key: '',
  access_token_secret: '',
  headlines_file: '',
});
```

Add your credentials accordingly, although it's recommended that you use environment variables to keep your private info safe.

e.g.

```
const headlines = new TwitterHeadlines({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  headlines_file: '',
});
```

State the location of your headlines config file.

```
const headlines = new TwitterHeadlines({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  headlines_file: './projectname.headlines.json',
});
```

## Collecting and Reading Headlines

Before you can `read` your Twitter Headlines you will need `collect` the latest articles from Twitter.

You can do this with the following:
```
headlines.collect();
```

This will collect and store JSON files within a __./headlines/__ folder, at the root of your project.

Collecting the latest headlines requires a call the Twitter API, which can only be done a limited number of times. To check your current `rate_limit_status` you can use the following:

```
headlines.rateLimit().then((response) => {
  // the 'response' includes the rate limit object
});
```

> Although you will also get the `rate_limit_status` from `collect` when calling it like this:

```
headlines.collect().then((response) => {
  // the 'response' includes the rate limit object
});
```

Once you have the source headlines you can create and read the combined headlines payload with the following:
```
headlines.read().then((response) => {
    // do something with 'response'
  });
```
The response is also stored in the __./headlines/__ folder.


## Configuring Twitter Headlines

The headlines config file allows developers to state which Twitter Lists they want to include, the rules for each and how to categorise the articles.

### Adding a source and it's associated rules

> The Twitter Lists need to exist, so you will need to create these first if you haven't already.

Once you have a valid Twitter List you can add to your config file list this:

```
"sources": [
    {
      "owner_screen_name": "Steven__Martin",
      "slug": "continuously-mac",
      "rules": {
        "default": "exclude all",
        "custom": [
          {
            "action": "force include",
            "where": "article",
            "contains": "apple"
          },
          {
            "action": "force include",
            "where": "source",
            "contains": "@tim_cook"
          }
        ]
      }
    },
```

The `owner_screen_name` and `slug` are used to identify the Twitter List.

The `rules` object holds an array of custom rules and the source default rule.
The source `default` rule tells the engine to either `include all` of the articles from the original Twitter List by default or to `exclude all` - allowing the developer to only include articles that match the custom rules.
Each `custom` rule can either force an article to be included (`force include`) or force it to be excluded (`force exclude`).

The rule will look for value of the `contains` field within the `where` location of the article, which can either be:

* `article`: Within the article description 
* `source`: Within the article source

### Categorising Articles

Articles can be categorised whenever a given 'search pattern' is met. Articles can only be assigned one category (the first one matched) however every article is 'tagged' with every category is matches.

Your configuration file should include a categories array like this:

```
"categories": [
    {
      "category": "iPad",
      "search_pattern": "ipad",
      "badge": "ipad_badge"
    },
    {
      "category": "iPad Pro",
      "search_pattern": "ipad *pro",
      "badge": "ipad_badge"
    },
    {
      "category": "iMac",
      "search_pattern": "imac",
      "badge": "imac_badge"
    },
    {
      "category": "MacBook",
      "search_pattern": "macbook",
      "badge": "imac_badge"
    }
  ],
```

### Sorting Articles

Headlines can be sorted in the following ways:

* `top20` : which will sort the first 20 articles with the highest __score__ first.
* `latest20`: which will sort the list into the latest 20 articles.

e.g.

```
    "sort": "top20"
```

The __score__ is determined by the age of the article, how many times it's been retweeted and the number of times it's been 'liked'.

### Example config file

The following is an example of what your complete config file should look like:

Save this to the root of your project as something like: `projectname.headlines.json`.

```
{
  "sources": [
    {
      "owner_screen_name": "Steven__Martin",
      "slug": "continuously-mac",
      "rules": {
        "default": "include all",
        "custom": [
        ]
      }
    },
    {
      "owner_screen_name": "Steven__Martin",
      "slug": "continuously-mac-support",
      "rules": {
        "default": "exclude all",
        "custom": [
          {
            "action": "force include",
            "where": "article",
            "contains": "apple"
          },
          {
            "action": "force include",
            "where": "article",
            "contains": "ios"
          },
          {
            "action": "force include",
            "where": "article",
            "contains": "mac"
          },
          {
            "action": "force include",
            "where": "article",
            "contains": "iphone"
          },
          {
            "action": "force include",
            "where": "article",
            "contains": "watch"
          },
          {
            "action": "force include",
            "where": "source",
            "contains": "@tim_cook"
          }
        ]
      }
    }
  ],
  "categories": [
    {
      "category": "iPhone",
      "search_pattern": "iphone",
      "badge": "iphone_badge"
    },
    {
      "category": "iOS",
      "search_pattern": "ios",
      "badge": "iphone_badge"
    },
    {
      "category": "iPad",
      "search_pattern": "ipad",
      "badge": "ipad_badge"
    },
    {
      "category": "MacBook",
      "search_pattern": "macbook",
      "badge": "imac_badge"
    },
    {
      "category": "Mac Mini",
      "search_pattern": "mac mini",
      "badge": "imac_badge"
    },
    {
      "category": "macOS",
      "search_pattern": "os *x",
      "badge": "imac_badge"
    },
    {
      "category": "macOS",
      "search_pattern": "mac *os",
      "badge": "imac_badge"
    },
    {
      "category": "App Store",
      "search_pattern": "app *store",
      "badge": "appstore_badge"
    },
    {
      "category": "Apple TV",
      "search_pattern": "apple *tv",
      "badge": "appletv_badge"
    },
    {
      "category": "tvOS",
      "search_pattern": "tvOS",
      "badge": "appletv_badge"
    },
    {
      "category": "Apple Music",
      "search_pattern": "apple *music",
      "badge": "applemusic_badge"
    },
    {
      "category": "watchOS",
      "search_pattern": "watchos",
      "badge": "applewatch_badge"
    },
    {
      "category": "Apple Watch",
      "search_pattern": "apple *watch",
      "badge": "applewatch_badge"
    },
    {
      "category": "Siri",
      "search_pattern": "siri",
      "badge": "default_badge"
    }
  ],
  "sort": "top20"
}
```
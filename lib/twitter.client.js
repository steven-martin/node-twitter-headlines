const Twitter = require('twitter');
const jsonfile = require('jsonfile');

const getSource = function getSource(ownerScreenName, slug, rules, config) {
  return new Promise(((resolve) => {
    const client = new Twitter(config);
    let response;

    client.get('application/rate_limit_status', (limitError, limitStatus) => {
      if (!limitError) {
        if (limitStatus.resources.lists['/lists/statuses'].remaining > 0) {
          // Rate Limit Acceptable, collecting data from Twitter and adding it to tweet_list.
          const params = { owner_screen_name: '', slug: '', count: '100' };
          params.owner_screen_name = ownerScreenName;
          params.slug = slug;
          client.get('lists/statuses', params, (listError, tweets) => {
            if (!listError) {
              const cacheFileName = `${config.cache_path}/${slug}.raw.json`;
              jsonfile.writeFile(cacheFileName, tweets, { spaces: 2 }, (err) => {
                if (err) throw err;
              });
            }
            response = {
              status: 'Success',
              rate_limit: {
                remaining: limitStatus.resources.lists['/lists/statuses'].remaining,
                limit: limitStatus.resources.lists['/lists/statuses'].limit,
              },
              slug,
              rules,
              data: tweets,
            };
            resolve(response);
            return response;
          });
        } else {
          // Rate Limit Status NOT Acceptable.
          response = {
            status: 'Rate Limit Status NOT Acceptable Error',
            rate_limit: {
              remaining: limitStatus.resources.lists['/lists/statuses'].remaining,
              limit: limitStatus.resources.lists['/lists/statuses'].limit,
            },
          };
          resolve(response);
          return response;
        }
      } else {
        response = {
          status: `Error - ${limitError}`,
          rate_limit: {
            remaining: 'unknown',
            limit: 'unknown',
          },
        };
        resolve(response);
        return response;
      }
      return limitStatus;
    });
  }));
};

const getRateLimit = async function getRateLimit(config) {
  return new Promise(((resolve) => {
    const client = new Twitter(config);
    client.get('application/rate_limit_status', (limitError, limitStatus) => {
      if (!limitError) {
        // console.log("limitStatus: " + JSON.stringify(limitStatus));
        const response = {
          rate_limit: {
            remaining: limitStatus.resources.lists['/lists/statuses'].remaining,
            limit: limitStatus.resources.lists['/lists/statuses'].limit,
          },
        };
        resolve(response);
        return response;
      }
      return limitStatus;
    });
  }));
};


exports.getSource = getSource;
exports.getRateLimit = getRateLimit;

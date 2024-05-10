/* eslint-disable import/extensions */
/* eslint-disable no-var */
var { SYSTEM_PROMPT } = require('./const.js');
var lang = require('./lang.js');

// TODO: test
// const $option = {};
// const $http = {
//   request: require('axios'),
// };
//

var { handleGeneralError, replacePromptKeywords } = require('./utils.js');

function supportLanguages() {
  // eslint-disable-next-line no-undef
  $log.info(lang.supportLanguages);
  // eslint-disable-next-line no-undef
  $log.info(lang.supportLanguages.map(([standardLang]) => standardLang));
  return lang.supportLanguages.map(([standardLang]) => standardLang);
}

/**
 * @param {Bob.TranslateQuery} query
 * @returns {{
 *  generatedSystemPrompt: string,
 *  generatedUserPrompt: string
 * }}
 */
function generatePrompts(query) {
  let generatedSystemPrompt = SYSTEM_PROMPT;
  const { detectFrom, detectTo } = query;
  const sourceLang = lang.langMap.get(detectFrom) || detectFrom;
  const targetLang = lang.langMap.get(detectTo) || detectTo;
  let generatedUserPrompt = `translate from ${sourceLang} to ${targetLang}`;

  if (detectTo === 'wyw' || detectTo === 'yue') {
    generatedUserPrompt = `翻译成${targetLang}`;
  }

  if (
    detectFrom === 'wyw' ||
    detectFrom === 'zh-Hans' ||
    detectFrom === 'zh-Hant'
  ) {
    if (detectTo === 'zh-Hant') {
      generatedUserPrompt = '翻译成繁体白话文';
    } else if (detectTo === 'zh-Hans') {
      generatedUserPrompt = '翻译成简体白话文';
    } else if (detectTo === 'yue') {
      generatedUserPrompt = '翻译成粤语白话文';
    }
  }
  if (detectFrom === detectTo) {
    generatedSystemPrompt =
      "You are a text embellisher, you can only embellish the text, don't interpret it.";
    if (detectTo === 'zh-Hant' || detectTo === 'zh-Hans') {
      generatedUserPrompt = '润色此句';
    } else {
      generatedUserPrompt = 'polish this sentence';
    }
  }

  generatedUserPrompt = `${generatedUserPrompt}:\n\n${query.text}`;

  return { generatedSystemPrompt, generatedUserPrompt };
}

/**
 * @param {string} model
 * @param {Bob.TranslateQuery} query
 * @returns {{
 *  model: string;
 *  temperature: number;
 *  max_tokens: number;
 *  top_p: number;
 *  frequency_penalty: number;
 *  presence_penalty: number;
 *  messages?: {
 *    role: "assistant" | "user";
 *    content: string;
 *  }[];
 *  prompt?: string;
 * }}
 */
function buildRequestBody(model, query) {
  // eslint-disable-next-line no-undef
  let { customSystemPrompt, customUserPrompt } = $option;
  const { generatedSystemPrompt, generatedUserPrompt } = generatePrompts(query);

  customSystemPrompt = replacePromptKeywords(customSystemPrompt, query);
  customUserPrompt = replacePromptKeywords(customUserPrompt, query);

  const systemPrompt = customSystemPrompt || generatedSystemPrompt;
  const userPrompt = customUserPrompt || generatedUserPrompt;

  const options = {
    temperature: 0.2,
    top_p: 1,
    frequency_penalty: 1,
    presence_penalty: 1,
  };

  return {
    options,
    model,
    stream: false,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  };
}

/**
 * @param {Bob.TranslateQuery} query
 * @param {string} targetText
 * @param {string} textFromResponse
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
function handleStreamResponse(query, targetText, textFromResponse) {
  if (textFromResponse !== '[DONE]') {
    try {
      const dataObj = JSON.parse(textFromResponse);
      // https://github.com/openai/openai-node/blob/master/src/resources/chat/completions.ts#L190
      const { choices } = dataObj;
      const delta = choices[0]?.delta?.content;
      if (delta) {
        // eslint-disable-next-line no-param-reassign
        targetText += delta;
        query.onStream({
          result: {
            from: query.detectFrom,
            to: query.detectTo,
            toParagraphs: [targetText],
          },
        });
      }
    } catch (err) {
      handleGeneralError(query, {
        type: err.type || 'param',
        message: err.message || 'Failed to parse JSON',
        addition: err.addition,
      });
    }
  }
  return targetText;
}

/**
 * @param {Bob.TranslateQuery} query
 * @param {Bob.HttpResponse} result
 * @returns {void}
 */
function handleGeneralResponse(query, result) {
  const data = result.data;

  if (!data || !data.message || !data.message.content) {
    handleGeneralError(query, {
      type: 'api',
      message: '接口未返回结果',
      addition: JSON.stringify(result),
    });
    return;
  }

  let targetText = data.message.content.trim();

  // 使用正则表达式删除字符串开头和结尾的特殊字符
  targetText = targetText.replace(/^(『|「|"|“)|(』|」|"|”)$/g, '');

  // 判断并删除字符串末尾的 `" =>`
  if (targetText.endsWith('" =>')) {
    targetText = targetText.slice(0, -4);
  }

  query.onCompletion({
    result: {
      from: query.detectFrom,
      to: query.detectTo,
      toParagraphs: targetText.split('\n'),
    },
  });
}

function translate(query) {
  // eslint-disable-next-line no-undef
  const { apiUrl } = $option;

  const baseUrl = apiUrl || 'http://localhost:11434';
  const apiUrlPath = '/api/chat';

  const modelValue = $option.model ?? "llama3";

  const body = buildRequestBody(modelValue, query);

  (async () => {
    try {
      // eslint-disable-next-line no-undef
      const result = await $http.request({
        method: 'POST',
        url: baseUrl + apiUrlPath,
        header: {
          'Content-Type': 'application/json',
        },
        // data: body, // TODO: body
        body: body, // TODO: body
      });

      // eslint-disable-next-line no-undef
      $log.info(
        JSON.stringify({
          method: 'POST',
          url: baseUrl + apiUrlPath,
          body,
        }),
      );
      // eslint-disable-next-line no-undef
      $log.info(JSON.stringify(result));

      if (result.error) {
        handleGeneralError(query, result);
      } else {
        handleGeneralResponse(query, result);
      }
    } catch (error) {
      handleGeneralError(query, error);

      // eslint-disable-next-line no-undef
      $log.info(error);
    }
  })();
}

function pluginTimeoutInterval() {
  return 60;
}

exports.pluginTimeoutInterval = pluginTimeoutInterval;
// exports.pluginValidate = pluginValidate;
exports.supportLanguages = supportLanguages;
exports.translate = translate;

// guoba.support.js
import _ from 'lodash';
import config from "./lib/config.js"; // This is the configProxy from config.js
// yaml is not directly used here for saving, config.js handles it via saveUserConfig
import path from "path";
// Assuming path.js is in 'model' directory relative to plugin root.
// And guoba.support.js is at plugin root.
import { pluginRoot } from "./model/path.js";

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'Ding-plugin',
      title: '适用于Yunzai的钉钉适配器',
      author: ['429'], 
      authorLink: ['https://github.com/XuF163'], 
      link: 'https://github.com/XuF163/Yunzai-plugin-Dingtalk', 
      isV3: true,
      isV2: false,
      showInMenu: true,
      description: 'Yunzai-Bot 的钉钉机器人适配器，支持多账号配置和消息发送。',
      icon: 'mdi:dingtalk',
      iconColor: '#0080FF',
      iconPath: path.join(pluginRoot, 'resources/icon.png'), // Ensure pluginRoot is correct
    },
    configInfo: {
      schemas: [
        {
          component: "Divider",
          label: "全局钉钉适配器设置",
          componentProps: { orientation: "left", plain: true },
        },
        {
          field: "enableDingAdapter",
          label: "启用钉钉适配器",
          component: "Switch",
          required: true,
          componentProps: { checkedChildren: "已启用", unCheckedChildren: "已禁用" },
          helpMessage: "控制是否整体启用或禁用钉钉适配器功能。",
        },
        {
          field: "debugGlobal",
          label: "全局调试模式",
          component: "Switch",
          componentProps: { checkedChildren: "开启", unCheckedChildren: "关闭" },
          helpMessage: "为所有钉钉账号启用或禁用详细的日志输出，主要用于问题排查。",
        },
        {
          component: "Divider",
          label: "钉钉机器人账号配置",
          componentProps: { orientation: "left", plain: true },
        },
        {
          field: "dingdingAccounts",
          label: "机器人列表",
          bottomHelpMessage: [
            "在此配置您的钉钉机器人应用。",
            "每个机器人均需在钉钉开放平台创建并获取相应凭证。",
            "保存配置后，Yunzai-Bot 会自动尝试重载此插件的配置。",
            "某些底层更改可能仍需手动重启 Yunzai-Bot 生效。"
          ],
          component: "GSubForm",
          componentProps: {
            multiple: true,
            showRemove: true,
            showAdd: true,
            maxCount: 10,
            removeText: '删除此机器人',
            addText: '添加新机器人',
            removeConfirmMessage: '确定要删除这个机器人配置吗？删除后此机器人的设置将丢失。',
            schemas: [
              {
                field: "accountId",
                label: "账号别名 (accountId)",
                component: "Input",
                required: true,
                componentProps: { placeholder: '自定义唯一标识 (例: main_bot)', allowClear: true },
                rules: [{ required: true, message: "账号别名 (accountId) 不能为空" }, { pattern: /^[a-zA-Z0-9_-]+$/, message: "仅支持字母、数字、下划线和减号" }],
                helpMessage: '用于程序内部区分不同机器人账号，必须唯一且符合规则。例如：ding_bot_finance, default_bot。',
              },
              {
                field: "botName",
                label: "机器人显示名称",
                component: "Input",
                required: false,
                componentProps: { placeholder: '机器人昵称 (可选, 例: 财务通知小助手)', allowClear: true },
                helpMessage: '机器人在机器人列表和日志中显示的名称。若不填，将使用默认或基于accountId的名称。',
              },
              {
                field: "clientId",
                label: "AppKey / ClientID",
                component: "Input",
                required: true,
                componentProps: { placeholder: '钉钉开放平台应用的 ClientID (旧称AppKey)', allowClear: true, maxLength: 64 },
                rules: [{ required: true, message: "ClientID (AppKey) 不能为空" }, { min: 6, message: "ClientID 通常长度较长" }],
                helpMessage: '从钉钉开放平台获取的应用凭证 ClientID。',
              },
              {
                field: "clientSecret",
                label: "AppSecret / ClientSecret",
                component: "InputPassword", // Use InputPassword for secrets
                required: true,
                componentProps: { placeholder: '钉钉开放平台应用的 ClientSecret (旧称AppSecret)', maxLength: 128 },
                rules: [{ required: true, message: "ClientSecret (AppSecret) 不能为空" }, { min: 16, message: "ClientSecret 通常长度较长, 至少16位" }],
                helpMessage: '从钉钉开放平台获取的应用凭证 ClientSecret。',
              },
              {
                field: "webhook",
                label: "默认Webhook (可选)",
                component: "Input",
                required: false,
                componentProps: { placeholder: '可选: https://oapi.dingtalk.com/...', type: 'url', allowClear: true },
                rules: [{ type: 'url', message: "请输入有效的Webhook URL地址 (如果填写)" }],
                helpMessage: '机器人默认的全局消息回调 Webhook 地址。通常用于机器人主动发送消息。如果消息事件中包含 sessionWebhook，则优先使用后者。',
              },
              {
                field: "debug",
                label: "独立调试模式",
                component: "Switch",
                required: false,
                componentProps: { checkedChildren: "开启", unCheckedChildren: "关闭" },
                helpMessage: "为此特定机器人账号独立启用或禁用详细日志输出，覆盖全局调试设置。",
              },
            ],
          }
        },
        {
          component: "Divider",
          label: "消息与图片高级选项（或许有用，但是大概率没用。。。）",
          componentProps: { orientation: "left", plain: true },
        },
        {
          field: "markdownImgScale",
          label: "Markdown图片缩放",
          component: "InputNumber",
          componentProps: { min: 0.1, max: 5.0, step: 0.1, placeholder: "默认 1.0 (不缩放)"},
          helpMessage: "发送到钉钉的Markdown消息中图片的全局缩放比例。例如：0.5 (缩小一半)，2.0 (放大一倍)。",
        },
         {
          field: "toBotUpload",
          label: "尝试通过Bot实例传图(未测试过，仍然建议公网使用)",
          component: "Switch",
          componentProps: { checkedChildren: "开启", unCheckedChildren: "关闭" },
          helpMessage: "当主要图片上传方式 (Bot.fileToUrl) 失败时，是否尝试通过其他已登录的Bot实例（如QQBot）上传图片以获取公网URL。",
        }
      ],

      getConfigData() {
        // 'config' 是导入的 configProxy 实例。
        // 直接访问 config.propertyName 会触发代理的 get 钩子，
        // 该钩子应从 configInstance.config 返回正确的配置值。

        // 调试：打印直接从代理获取的 dingdingAccounts
        const rawAccountsFromProxy = config.dingdingAccounts;
        
        const accountsToDisplay = (rawAccountsFromProxy || []).map(acc => {
          // 做一个防御性检查，确保 acc 是一个对象
          if (typeof acc !== 'object' || acc === null) {
          
            return null; // 或者返回一个默认的空结构体，如果后续逻辑需要
          }
          return {
            accountId: acc.accountId,
            botName: acc.botName, // 确保这个字段在您的配置和 schema 中都存在
            clientId: acc.clientId,
            clientSecret: acc.clientSecret,
            webhook: acc.webhook,
            debug: acc.debug !== undefined ? acc.debug : false,
          };
        }).filter(acc => acc !== null); // 过滤掉处理过程中可能产生的 null 值

        const result = {
          enableDingAdapter: config.enableDingAdapter !== undefined ? config.enableDingAdapter : true,
          debugGlobal: config.debugGlobal !== undefined ? config.debugGlobal : false,
          dingdingAccounts: accountsToDisplay,
          markdownImgScale: config.markdownImgScale !== undefined ? config.markdownImgScale : 1.0,
          toBotUpload: config.toBotUpload !== undefined ? config.toBotUpload : false,
        };

        console.log('[Ding-plugin Guoba getConfigData] 即将返回给 Guoba 面板的数据:', JSON.stringify(result, null, 2));
        return result;
      },
      // Receives data FROM Guoba UI and saves it
      // The 'data' object structure matches the 'field' names in schemas
      setConfigData(dataFromUI, { Result }) {
        try {
          console.log('[Ding-plugin Guoba] Received data from UI:', JSON.stringify(dataFromUI, null, 2));

          const accountsForSaving = (dataFromUI.dingdingAccounts || []).map(acc => ({
            accountId: acc.accountId?.trim() || undefined, // Keep undefined if empty for cleaner YAML
            botName: acc.botName?.trim() || undefined,
            clientId: acc.clientId?.trim() || undefined,
            clientSecret: acc.clientSecret?.trim() || undefined, // Secrets should not be trimmed if spaces are part of it, but usually not.
            webhook: acc.webhook?.trim() || undefined,
            debug: acc.debug !== undefined ? acc.debug : false, // Default to false if not present
          })).filter(acc => acc.accountId && acc.clientId && acc.clientSecret); // Basic filter for essential fields

          // This object represents the exact content to be saved in the user's configuration file.
          // It should only contain settings managed by this Guoba panel.
          const userSettingsToSave = {
            enableDingAdapter: dataFromUI.enableDingAdapter !== undefined ? dataFromUI.enableDingAdapter : true,
            debugGlobal: dataFromUI.debugGlobal !== undefined ? dataFromUI.debugGlobal : false,
            dingdingAccounts: accountsForSaving,
            markdownImgScale: dataFromUI.markdownImgScale !== undefined ? parseFloat(dataFromUI.markdownImgScale) : undefined, // Ensure number
            toBotUpload: dataFromUI.toBotUpload !== undefined ? dataFromUI.toBotUpload : false,
            // Add other top-level settings from schemas here
          };
          
          // Remove undefined top-level keys for a cleaner YAML output
          for (const key in userSettingsToSave) {
            if (userSettingsToSave[key] === undefined) {
              delete userSettingsToSave[key];
            }
          }
          if (userSettingsToSave.dingdingAccounts) {
            userSettingsToSave.dingdingAccounts.forEach(acc => {
                 for (const key in acc) {
                    if (acc[key] === undefined) {
                        delete acc[key];
                    }
                 }
            });
          }


          console.log('[Ding-plugin Guoba] Prepared userSettingsToSave for config.saveUserConfig():', JSON.stringify(userSettingsToSave, null, 2));

          // Call the new saveUserConfig on the configInstance (accessed via configProxy)
          config.saveUserConfig(userSettingsToSave);

          // IMPORTANT: After saving, the main config must be reloaded
          // so that the in-memory `config.config` reflects the saved changes
          // and any merging logic with defaults is re-applied.
          console.log('[Ding-plugin Guoba] User config saved. Reloading configurations...');
          config.loadConfigs(); // Directly call on the proxy, which should delegate to instance

          return Result.ok({}, '钉钉配置已保存。配置将自动重载。');
        } catch (error) {
          console.error('钉钉配置保存或重载时发生错误:', error);
          return Result.error('保存配置失败: ' + (error.message || error.toString()));
        }
      }
    }
  };
}
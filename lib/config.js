// lib/config.js
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import chokidar from "chokidar";
import _ from "lodash";
import EventEmitter from "events";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Config extends EventEmitter {
  constructor() {
    super();
    this.defaultConfigDir = path.resolve(__dirname, "../config/defCfg");
    this.userConfigDir = path.resolve(__dirname, "../config/Cfg");
    this.userConfigFilePath = path.join(this.userConfigDir, 'default.yaml');
    this.config = {}; // Initialize with an empty object

    this.loadConfigs(); // Initial load
    this.setupWatchers();
  }

  loadConfigs() {
    // Preserve the state of this.config before attempting a reload
    // This is crucial for rollback if the new load fails.
    const previousValidConfig = _.cloneDeep(this.config); // Clone current state (could be {} initially)

    try {
      const defaultConfigs = this.loadYamlFiles(this.defaultConfigDir) || {}; // Ensure defaultConfigs is an object
      let userConfigs = {};

      if (!fs.existsSync(this.userConfigDir)) {
        console.warn(`用户配置目录 ${this.userConfigDir} 不存在，将创建。`);
        fs.mkdirSync(this.userConfigDir, { recursive: true });
      }

      if (!fs.existsSync(this.userConfigFilePath) && this.isUserConfigDirEmpty(true)) {
        logger.info(`用户配置文件 ${this.userConfigFilePath} 不存在且目录为空，将从默认配置初始化。`);
        this.copyDefaultConfigsToUserDir();
        userConfigs = this.loadYamlFile(this.userConfigFilePath) || {};
      } else if (fs.existsSync(this.userConfigFilePath)) {
        userConfigs = this.loadYamlFile(this.userConfigFilePath) || {};
      } else {
        userConfigs = {};
      }

      let processedUserConfigs = this._preprocessAliases(_.cloneDeep(userConfigs || {}));

      let mergedConfig = _.cloneDeep(defaultConfigs);
      _.mergeWith(mergedConfig, processedUserConfigs, (objValue, srcValue) => {
        if (_.isArray(srcValue)) {
          return srcValue;
        }
        return undefined;
      });

      this.config = mergedConfig; // Tentatively assign the newly merged config

      if (!this.validateConfig(this.config)) { // Validate the newly merged config
        console.error("新加载的配置验证失败，将尝试回滚到前一个有效配置。");
        this.config = previousValidConfig; // Rollback
        // Re-validate the rolled-back config. If it's also invalid, something is very wrong.
        if (!this.validateConfig(this.config)) {
            console.error("回滚后的配置仍然无效！将重置为最小化默认配置。");
            this.config = _.cloneDeep(defaultConfigs); // Fallback to fresh defaults
            if(!this.validateConfig(this.config)){ // Validate fresh defaults
                 console.error("最小化默认配置也无效！将使用一个空配置对象。");
                 this.config = {}; // Absolute last resort
                 this.validateConfig(this.config); // Try to populate with minimal defaults
            }
        }
      } else {
        // logger.info("配置已成功加载并验证:", JSON.stringify(this.config, null, 2));
        logger.info("配置已成功加载并验证。");
      }

      this.emit("update", this.config);

    } catch (error) {
      console.error("加载配置时发生严重错误:", error);
      console.warn("由于严重错误，尝试回滚到前一个有效配置。");
      this.config = previousValidConfig; // Rollback to the config state before this load attempt

      // Ensure this.config is an object and try to validate it
      if (typeof this.config !== 'object' || this.config === null) {
          console.error("回滚目标配置无效，将重置为新初始化的默认配置。");
          const defaultConfFallback = this.loadYamlFiles(this.defaultConfigDir) || {};
          this.config = _.cloneDeep(defaultConfFallback);
      }
      if(!this.validateConfig(this.config)){ // Validate the rolled-back or default-fallback config
          console.error("回滚/默认回退后的配置仍然无效！将使用一个空配置对象。");
          this.config = {};
          this.validateConfig(this.config); // Populate with minimal defaults
      }
      this.emit("update", this.config); // Emit update with whatever config we ended up with
    }
  }

  _preprocessAliases(configsToProcess) {
    // Ensure configsToProcess is an object
    if (typeof configsToProcess !== 'object' || configsToProcess === null) {
        return {};
    }
    if (Array.isArray(configsToProcess.dingdingAccounts)) {
      configsToProcess.dingdingAccounts = configsToProcess.dingdingAccounts.map(account => {
        if (typeof account !== 'object' || account === null) return null; // Skip invalid account entries
        const newAccount = { ...account };
        const aliasMap = {
          accountId: ['corp_id', 'app_id'],
          clientId: ['client_id', 'app_key'],
          clientSecret: ['client_secret', 'app_secret'],
          botName: ['bot_name']
        };
        for (const [canonicalKey, oldKeys] of Object.entries(aliasMap)) {
          for (const oldKey of oldKeys) {
            if (newAccount.hasOwnProperty(oldKey) && typeof newAccount[oldKey] !== 'undefined') {
              if (!newAccount.hasOwnProperty(canonicalKey) || typeof newAccount[canonicalKey] === 'undefined') {
                newAccount[canonicalKey] = newAccount[oldKey];
              }
            }
          }
        }
        return newAccount;
      }).filter(account => account !== null); // Remove any nulls from map
    }
    return configsToProcess;
  }

  validateConfig(configToValidate) {
    // configToValidate can now be {} in worst-case scenarios, so this must handle it.
    if (typeof configToValidate !== 'object' || configToValidate === null) {
        console.error("validateConfig 接收到无效的 configToValidate (null 或非对象)。");
        return false; // Cannot validate
    }

    if (typeof configToValidate.enableDingAdapter === 'undefined') {
      configToValidate.enableDingAdapter = true;
    }

    if (!Array.isArray(configToValidate.dingdingAccounts)) {
      configToValidate.dingdingAccounts = [];
    }

    let isValidOverall = true;
    configToValidate.dingdingAccounts = configToValidate.dingdingAccounts.filter((account, index) => {
      if (!account || typeof account !== 'object') {
        console.warn(`配置警告: 钉钉账户 #${index + 1} 数据无效，将被移除。`);
        return false; // Remove invalid entry
      }
      const accIdForLog = account.accountId || `(无accountId)_${index}`;
      if (!account.accountId || !account.clientId || !account.clientSecret) {
        console.warn(`配置警告: 钉钉账户 "${accIdForLog}" 缺少 accountId, clientId, 或 clientSecret。此账户可能无法正常工作。`);
        // Don't set isValidOverall to false here if we want to allow saving partial configs from Guoba
        // The adapter itself should skip loading such invalid accounts.
      }
      return true;
    });
    return isValidOverall; // For now, structural validity of top-level keys
  }

  isUserConfigDirEmpty(checkSpecificFile = false) {
    if (!fs.existsSync(this.userConfigDir)) {
      return true;
    }
    if (checkSpecificFile) {
        return !fs.existsSync(this.userConfigFilePath) || (fs.existsSync(this.userConfigFilePath) && fs.readFileSync(this.userConfigFilePath, 'utf8').trim() === '');
    }
    const files = fs.readdirSync(this.userConfigDir);
    return files.filter((file) => file.endsWith(".yaml") || file.endsWith(".yml")).length === 0;
  }

  copyDefaultConfigsToUserDir() {
    if (!fs.existsSync(this.defaultConfigDir)) {
      console.warn(`默认配置目录不存在: ${this.defaultConfigDir}，无法复制。`);
      return;
    }
    if (!fs.existsSync(this.userConfigDir)) {
      fs.mkdirSync(this.userConfigDir, { recursive: true });
    }
    const defaultFileSourcePath = path.join(this.defaultConfigDir, 'default.yaml'); // Assuming default is always default.yaml
    const userFileDestPath = this.userConfigFilePath;

    if (fs.existsSync(defaultFileSourcePath)) {
        try {
            fs.copyFileSync(defaultFileSourcePath, userFileDestPath);
            logger.info(`已将默认配置文件 ${defaultFileSourcePath} 复制到用户配置文件 ${userFileDestPath}`);
        } catch (copyError) {
            console.error(`复制默认配置文件失败:`, copyError);
        }
    } else {
        console.warn(`默认配置文件 ${defaultFileSourcePath} 未找到，无法复制。`);
    }
  }

  loadYamlFiles(dir) { // This mainly loads the default config directory
    if (!fs.existsSync(dir)) {
      return {};
    }
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));
    const configData = {};
    files.forEach((file) => {
      const filePath = path.join(dir, file);
      try {
        const fileContents = fs.readFileSync(filePath, "utf8");
        if (fileContents.trim() === "") { // Skip empty files
            console.warn(`配置文件 ${filePath} 为空，已跳过。`);
            return;
        }
        let data = yaml.load(fileContents);
        _.merge(configData, data);
      } catch (err) {
        console.error(`加载YAML文件 ${filePath} 失败:`, err);
      }
    });
    return configData;
  }

  loadYamlFile(filePath) { // This loads the user's default.yaml
    if (!fs.existsSync(filePath)) {
      return {};
    }
    try {
      const fileContents = fs.readFileSync(filePath, "utf8");
      if (fileContents.trim() === "") {
        return {}; // If user file is empty, it's an empty user config
      }
      let data = yaml.load(fileContents);
      return data || {}; // Ensure object if yaml.load returns null/undefined
    } catch (err) {
      console.error(`加载YAML文件 ${filePath} 失败:`, err);
      return {}; // Return empty on error, loadConfigs will handle rollback or defaults
    }
  }

  setupWatchers() {
    // ... (watcher setup remains the same)
    const watchPaths = [
        path.join(this.defaultConfigDir, '**/*.yaml'),
        path.join(this.defaultConfigDir, '**/*.yml'),
        this.userConfigFilePath
    ];
    const watcherOptions = { persistent: true, ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 } };

    try {
        const watcher = chokidar.watch(watchPaths, watcherOptions);
        watcher
          .on("add", (filePath) => this.onFileChange(filePath, "add"))
          .on("change", (filePath) => this.onFileChange(filePath, "change"))
          .on("unlink", (filePath) => this.onFileChange(filePath, "unlink"))
          .on("error", (error) => console.error(`配置监听器错误: ${error}`));
    } catch (error) {
        console.error("初始化配置监听器失败:", error);
    }
  }

  onFileChange(filePath, event) {
    logger.info(`配置文件 ${event}: ${filePath}。重新加载所有配置...`);
    this.loadConfigs();
  }

  // get(key) remains same
  get(key) {
    return _.get(this.config, key);
  }

  // saveUserConfig(userConfigData) remains same
  saveUserConfig(userConfigData) {
    try {
      if (!fs.existsSync(this.userConfigDir)) {
        fs.mkdirSync(this.userConfigDir, { recursive: true });
      }
      const output = yaml.dump(userConfigData || {});
      fs.writeFileSync(this.userConfigFilePath, output, 'utf8');
      logger.info(`用户配置已保存到: ${this.userConfigFilePath}`);
    } catch (error) {
      logger.error('保存用户配置失败:', error);
      throw error;
    }
  }
}

// Proxy and exports remain the same
const configInstance = new Config();

const configProxy = new Proxy(configInstance, {
  get(target, prop) {
    // target 是 configInstance
    // prop 是正在被访问的属性名

    // 优先级 1: 明确定义的实例方法/属性 (非 this.config 数据的一部分)
    // 此列表应包含 Config 类所有可直接调用的方法和非配置数据的属性
    const directInstanceProps = [
        'loadConfigs', 'saveUserConfig', 'defaultConfigDir', 'userConfigDir',
        'userConfigFilePath', 'onFileChange', 'setupWatchers', 'get',
        'isUserConfigDirEmpty', 'copyDefaultConfigsToUserDir', 'loadYamlFiles', 'loadYamlFile',
        '_preprocessAliases', 'validateConfig',
        // EventEmitter 的方法
        'on', 'once', 'off', 'emit', 'addListener', 'removeListener', 'removeAllListeners', 'listeners', 'listenerCount', 'setMaxListeners', 'getMaxListeners'
    ];

    if (directInstanceProps.includes(String(prop))) {
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
    }

    // 优先级 2: 从已加载的配置数据 (target.config 对象) 中获取属性
    // enableDingAdapter, dingdingAccounts 等应从此获取
    if (target.config && typeof target.config === 'object' && Object.prototype.hasOwnProperty.call(target.config, prop)) {
        return target.config[prop];
    }

    // 优先级 3: 如果属性名是字符串 'config'，则返回整个合并后的配置对象
    // 这使得 configProxy.config (例如在 getConfig() 中使用) 能返回正确的对象
    if (prop === 'config') {
        return target.config; // 返回实际的合并配置对象
    }

    // 降级方案: 如果属性直接存在于实例上且上面未捕获 (应罕见)
    if (Object.prototype.hasOwnProperty.call(target, prop)) {
        const value = target[prop];
        // console.warn(`ConfigProxy:Fallback: Accessing instance property '${String(prop)}'`);
        return typeof value === 'function' ? value.bind(target) : value;
    }

    // console.warn(`ConfigProxy: Property '${String(prop)}' not found on instance or in config data.`);
    return undefined;
  },
  set(target, prop, value) {
    if (prop in target.config) {
        
        return false;
    }
    target[prop] = value;
    return true;
  }
});

export default configProxy;

export function getConfig() {
  return configProxy.config;
}

export function reloadConfig() {
  configInstance.loadConfigs();
}

export const PLUGIN_ROOT = path.resolve(__dirname, "../");
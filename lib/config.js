// lib/config.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import chokidar from "chokidar";
import _ from "lodash";
import EventEmitter from "events";

// 获取当前文件的目录名
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Config extends EventEmitter {
  constructor() {
    super();
    // 配置目录路径
    this.defaultConfigDir = path.resolve(__dirname, "../config/defCfg");
    this.userConfigDir = path.resolve(__dirname, "../config/Cfg");
    // 存储配置的对象
    this.config = {};

    // 初始加载配置
    this.loadConfigs();
    // 设置文件监视器
    this.setupWatchers();
  }

  /**
   * 加载默认配置和用户配置，并合并
   */
  loadConfigs() {
    const defaultConfigs = this.loadYamlFiles(this.defaultConfigDir);
    // **新增：检查用户配置目录是否为空，如果为空则复制默认配置**
    if (this.isUserConfigDirEmpty()) {
      this.copyDefaultConfigsToUserDir();
      console.log(
        "User configuration directory was empty, default configurations copied.",
      );
    }
    const userConfigs = this.loadYamlFiles(this.userConfigDir);

    // 深度合并默认配置和用户配置，用户配置覆盖默认配置
    this.config = _.merge({}, defaultConfigs, userConfigs);
    // 触发更新事件
    this.emit("update", this.config);
    console.log("Configurations loaded:", this.config);
  }

  /**
   * **新增方法：检查用户配置目录是否为空**
   * @returns {boolean} 如果用户配置目录为空，则返回 true，否则返回 false
   */
  isUserConfigDirEmpty() {
    if (!fs.existsSync(this.userConfigDir)) {
      return true; // 如果用户配置目录不存在，也视为空
    }
    const files = fs.readdirSync(this.userConfigDir);
    return (
      files.filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
        .length === 0
    );
  }

  /**
   * **新增方法：复制默认配置到用户配置目录**
   */
  copyDefaultConfigsToUserDir() {
    if (!fs.existsSync(this.defaultConfigDir)) {
      console.warn(
        `Default configuration directory does not exist: ${this.defaultConfigDir}, cannot copy.`,
      );
      return;
    }
    if (!fs.existsSync(this.userConfigDir)) {
      fs.mkdirSync(this.userConfigDir, { recursive: true }); // 确保用户配置目录存在
    }

    const defaultFiles = fs.readdirSync(this.defaultConfigDir);
    defaultFiles.forEach((file) => {
      const defaultFilePath = path.join(this.defaultConfigDir, file);
      const userFilePath = path.join(this.userConfigDir, file);
      if (file.endsWith(".yaml") || file.endsWith(".yml")) {
        fs.copyFileSync(defaultFilePath, userFilePath);
      }
    });
  }

  /**
   * 读取指定目录下所有YAML文件并解析
   * @param {string} dir 目录路径
   * @returns {object} 合并后的配置对象
   */
  loadYamlFiles(dir) {
    if (!fs.existsSync(dir)) {
      console.warn(`Configuration directory does not exist: ${dir}`);
      return {};
    }

    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));
    const configData = {};

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      try {
        const fileContents = fs.readFileSync(filePath, "utf8");
        const data = yaml.load(fileContents);
        // 深度合并配置数据
        _.merge(configData, data);
      } catch (err) {
        console.error(`Error loading YAML file ${filePath}:`, err);
      }
    });

    return configData;
  }

  /**
   * 设置文件监视器，监视defCfg和Cfg目录下的YAML文件变化
   */
  setupWatchers() {
    const watcherOptions = { persistent: true, ignoreInitial: true };

    const watcher = chokidar.watch(
      [this.defaultConfigDir, this.userConfigDir],
      watcherOptions,
    );

    watcher
      .on("add", (filePath) => this.onFileChange(filePath, "add"))
      .on("change", (filePath) => this.onFileChange(filePath, "change"))
      .on("unlink", (filePath) => this.onFileChange(filePath, "unlink"))
      .on("error", (error) => console.error(`Watcher error: ${error}`));
  }

  /**
   * 处理文件变化事件
   * @param {string} filePath 文件路径
   * @param {string} event 事件类型
   */
  onFileChange(filePath, event) {
    if (!filePath.endsWith(".yaml") && !filePath.endsWith(".yml")) return;

    console.log(`File ${event}: ${filePath}`);

    // 重新加载所有配置
    this.loadConfigs();
  }

  /**
   * 通过键名获取配置值
   * @param {string} key 配置键
   * @returns {*} 配置值
   */
  get(key) {
    return this.config[key];
  }
}

// 创建Config实例并使用Proxy实现Config.id的访问方式
const configInstance = new Config();

const configProxy = new Proxy(configInstance, {
  get(target, prop) {
    // 如果属性存在于Config实例中，直接返回
    if (prop in target) {
      return target[prop];
    }
    // 否则，尝试从配置中获取
    return target.get(prop);
  },
});

export default configProxy;

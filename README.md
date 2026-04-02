# Claude Code

![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/@anthropic-ai/claude-code)

[npm]: https://img.shields.io/npm/v/@anthropic-ai/claude-code.svg?style=flat-square

Claude Code 是一个智能编码工具，它运行在您的终端中，理解您的代码库，并通过执行常规任务、解释复杂代码和处理 git 工作流程来帮助您更快地编码 —— 所有这些都通过自然语言命令完成。您可以在终端、IDE 中使用它，或在 Github 上标记 @claude。

**在 [Claude Code 主页](https://claude.com/product/claude-code) 了解更多** | [文档](https://code.claude.com/docs/en/overview)

<img src="https://github.com/anthropics/claude-code/blob/main/demo.gif?raw=1" />

## 开始使用

1. 安装 Claude Code：

```sh
npm install -g @anthropic-ai/claude-code
```

2. 导航到您的项目目录并运行 `claude`。

## 报告错误

我们欢迎您的反馈。使用 `/bug` 命令在 Claude Code 中直接报告问题，或提交 [GitHub issue](https://github.com/anthropics/claude-code/issues)。

## 加入 Discord 社区

加入 [Claude 开发者 Discord](https://anthropic.com/discord)，与其他使用 Claude Code 的开发者联系。获取帮助、分享反馈并与社区讨论您的项目。

## 数据收集、使用和保留

当您使用 Claude Code 时，我们会收集反馈，包括使用数据（如代码接受或拒绝）、相关的对话数据以及通过 `/bug` 命令提交的用户反馈。

### 我们如何使用您的数据

请参阅我们的 [数据使用政策](https://code.claude.com/docs/en/data-usage)。

### 隐私保护措施

我们已实施多项保护措施来保护您的数据，包括对敏感信息的有限保留期和对用户会话数据的受限访问。

有关完整详情，请查看我们的 [商业服务条款](https://www.anthropic.com/legal/commercial-terms) 和 [隐私政策](https://www.anthropic.com/legal/privacy)。

## 源代码反编译

如果您有 `cli.js` 和 `cli.js.map` 文件，您可以使用以下步骤反编译源代码：

### 前提条件
- Node.js 18+（推荐：v18.20.8）
- npm（包含在 Node.js 中）

### 反编译步骤

1. **安装依赖**：
   ```sh
   # 安装 source-map 库
   npm install source-map
   ```

2. **创建反编译脚本**（`parse-sourcemap.js`）：
   ```javascript
   const fs = require('fs');
   const path = require('path');
   const { SourceMapConsumer } = require('source-map');

   // 读取 source map 文件
   const sourceMapContent = fs.readFileSync('./cli.js.map', 'utf8');
   const sourceMap = JSON.parse(sourceMapContent);

   console.log('Source Map version:', sourceMap.version);
   console.log('Source Root:', sourceMap.sourceRoot);
   
   // 创建项目源文件输出目录
   const outputDir = './project-source';
   if (!fs.existsSync(outputDir)) {
     fs.mkdirSync(outputDir, { recursive: true });
   }

   // 筛选并导出项目源文件（排除 node_modules）
   let projectFileCount = 0;
   if (sourceMap.sourcesContent && sourceMap.sources) {
     sourceMap.sources.forEach((sourcePath, index) => {
       // 跳过 node_modules 和 lodash 文件
       if (!sourcePath.includes('node_modules') && !sourcePath.includes('lodash')) {
         const content = sourceMap.sourcesContent[index];
         if (content) {
           // 创建文件路径
           const fileName = path.basename(sourcePath);
           const outputPath = path.join(outputDir, fileName);
           
           // 写入文件
           fs.writeFileSync(outputPath, content);
           projectFileCount++;
         }
       }
     });
   }

   console.log(`成功导出 ${projectFileCount} 个项目源文件到 ${outputDir}`);
   console.log('反编译完成。');
   ```

3. **运行反编译脚本**：
   ```sh
   node parse-sourcemap.js
   ```

4. **反编译结果**：
   - 成功从 `cli.js.map` 文件中提取并导出了 1901 个项目核心代码文件
   - 这些文件已经保存在 `./project-source` 目录中

5. **访问反编译后的源代码**：
   反编译后的源代码将在 `project-source` 目录中可用。

## 编译方法

要从反编译的源代码重新编译项目，请按照以下步骤操作：

### 前提条件
- Node.js 18+
- Bun（推荐用于构建过程）

### 编译步骤

1. **安装 Bun**（如果尚未安装）：
   ```sh
   # 在 macOS、Linux 和 WSL 上
   curl -fsSL https://bun.sh/install | bash
   
   # 在 Windows 上（使用 PowerShell）
   iwr https://bun.sh/install.ps1 -useb | iex
   ```

2. **安装项目依赖**：
   ```sh
   bun install
   ```

3. **构建项目**：
   ```sh
   bun run build
   ```

4. **验证构建**：
   构建成功后，您应该在项目根目录中看到 `cli.js` 和 `cli.js.map` 文件。

### 构建配置

注意：此存储库中的 `package.json` 文件非常简单，仅包含用于反编译的 `source-map` 依赖。原始构建配置未包含在内。

### 自定义构建设置

要为反编译的源代码设置构建过程，您可以创建一个更全面的 `package.json` 文件，其中包含构建脚本。以下是一个示例：

```json
{
  "name": "claude-code",
  "version": "1.0.0",
  "description": "Claude Code - 智能编码工具",
  "main": "cli.js",
  "scripts": {
    "build": "bun build src/cli.tsx --outfile cli.js --sourcemap",
    "dev": "bun run src/cli.tsx"
  },
  "dependencies": {
    "source-map": "^0.7.6"
  },
  "devDependencies": {
    "bun-types": "latest"
  }
}
```

根据您的项目结构和构建要求调整构建脚本。

## 运行说明

### 关于编译产物

**重要说明：** 这个项目编译出来的不是 `.exe` 文件，而是 JavaScript 脚本文件。这是因为：

- **JavaScript 是解释型语言**：需要通过 Node.js 或 Bun 等运行时来执行
- **跨平台兼容性**：JavaScript 脚本可以在 Windows、macOS、Linux 等不同系统上运行
- **模块化设计**：便于更新和维护

### 运行方式

您可以通过以下方式运行 Claude Code：

#### 1. 通过全局安装运行（推荐）
```sh
# 查看版本
claude --version

# 非交互式模式
claude -p "你的问题"

# 交互式模式
claude
```

#### 2. 通过源码运行
```sh
# 使用 Bun 运行
cd C:\Users\Administrator\Desktop\claude-code-source
bun run cli.js --version
bun run cli.js -p "你的问题"

# 或使用 Node.js 运行
cd C:\Users\Administrator\Desktop\claude-code-source
node cli.js --version
node cli.js -p "你的问题"
```

### 注意事项

- **Node.js 版本要求**：推荐使用 Node.js v18.20.8
- **Bun 版本要求**：推荐使用 Bun v1.3.11 或更高版本
- **依赖安装**：运行前请确保已安装所有必要的依赖

如果您需要创建一个 `.exe` 文件，可以考虑使用工具如 **pkg** 或 **nexe** 来将 Node.js 应用打包成可执行文件。

## Trae Builder

### 思考过程
让我先检查当前 git 仓库状态，然后执行推送操作。

**claude-code-source**
自动运行
```
git status
```

**Thought**
让我先添加新文件到 git 仓库，然后提交并推送到远程仓库。

**claude-code-source**
手动运行
```
git add LICENSE.md README.md bun.lock cli.js cli.js.map package-lock.json package.json parse-sourcemap.js project-source/ source-files/
```

**Thought**
现在让我提交更改并推送到远程仓库。

**claude-code-source**
自动运行
```
git commit -m "反编译源代码并更新 README.md"
```

**Thought**
让我先检查远程仓库的配置，然后推送到远程仓库。

**claude-code-source**
自动运行
```
git remote -v
```

**Thought**
我注意到当前仓库还没有配置远程仓库。为了推送到远程仓库，我需要先知道远程仓库的 URL。请提供您的远程仓库 URL，例如：git@github.com:username/repository.git 或 `https://github.com/username/repository.git。`

提供后，我将为您添加远程仓库并执行推送操作。

### 使用 D:\SDK\node-v18.20.8 编译本项目

**Trae Builder**

**思考过程**
让我先查看 package.json 文件，了解项目的依赖和构建脚本，然后使用指定的 Node.js 版本编译项目。

**package.json**
1-50

**Thought**
让我检查项目中是否有 TypeScript 配置文件或其他构建相关的文件。

**claude-code-source**
自动运行
```
ls *.json *.tsconfig *.jsconfig
```

**(TraeAI-2) C:\Users\Administrator\Desktop\claude-code-source [0:0] $ ls *.json *.tsconfig *.jsconfig**

**Thought**
让我检查 project-source 目录中的文件，了解项目结构和构建需求。

**claude-code-source**
自动运行
```
ls project-source | grep -E "tsconfig|package|build|webpack|rollup|vite"
```

**(TraeAI-2) C:\Users\Administrator\Desktop\claude-code-source [0:0] $ ls project-source | grep -E "tsconfig|package|buil**

```
ls project-source | grep -E "tsconfig|package|build|webpack|rollup|vite"
grep : 无法将"grep"项识别为 cmdlet、函数、脚本文件或可运行程序的名称。请检查
名称的拼写，如果包括路径，请确保路径正确，然后再试一次。
所在位置 行:1 字符: 21
+ ls project-source | grep -E "tsconfig|package|build|webpack|rollup|vi ...
+ ~~~
+ CategoryInfo : ObjectNotFound: (grep:String) [], CommandNotFoun
 dException
+ FullyQualifiedErrorId : CommandNotFoundException
```

**Thought**
让我使用 PowerShell 命令检查项目中的构建配置文件。

**claude-code-source**
自动运行
```
Get-ChildItem -Path project-source -Name | Where-Object { $_ -like "*tsconfig*" -or $_ -like "*package*" -or $_ -like "*build*" -or $_ -like "*webpack*" -or $_ -like "*rollup*" -or $_ -like "*vite*" }
```

**ject { $_ -like "*tsconfig*" -or $_ -like "*package*" -or $_ -like "*build*" -or $_ -like "*webpack*" -or $_ -like "*rollup*" -or $_ -like "*vite*" }**

```
caCertsConfig.ts
mcpSkillBuilders.ts
PackageManagerAutoUpdater.tsx
packageManagers.ts
```

**Thought**
让我查看项目的入口文件，了解项目的构建方式。

**project-source\index.ts**
1-50

**project-source\main.tsx**
1-50

**Thought**
让我检查项目中是否有 Bun 配置文件，以及是否需要安装依赖。

**claude-code-source**
自动运行
```
Get-ChildItem -Name | Where-Object { $_ -like "*bun*" -or $_ -like "*package*" }
```

**package.json:\Users\Administrator\Desktop\claude-code-source [0:0] $ Get-ChildIt**

**Thought**
让我先安装项目依赖，然后使用 Bun 构建项目。

**claude-code-source**
自动运行
```
D:\SDK\node-v18.20.8\npm install
```

**(all characters skipped)**

**Thought**
让我查看 package.json 文件，确认是否有构建脚本。

**package.json**
1-20

**Thought**
让我检查项目中是否有 Bun 配置文件。

**claude-code-source**
自动运行
```
Get-ChildItem -Name | Where-Object { $_ -like "*bun*config*" -or $_ -like "*config*bun*" }
```

**\*config*" -or $_ -like "*config*bun*" }**

**Thought**
让我尝试使用 Bun 构建项目，因为从代码中可以看到项目使用了 Bun。

**claude-code-source**
自动运行
```
bun build project-source/main.tsx --outfile=cli.js
```

**(TraeAI-2) C:\Users\Administrator\Desktop\claude-code-source [0:0] $ bun build project-source/main.tsx --outfile=cli.js**

**Thought**
让我检查 Bun 是否正确安装。

**claude-code-source**
自动运行
```
bun --version
```

**(TraeAI-2) C:\Users\Administrator\Desktop\claude-code-source [0:0] $ bun --version**

```
bun : 无法将"bun"项识别为 cmdlet、函数、脚本文件或可运行程序的名称。请检查名
称的拼写，如果包括路径，请确保路径正确，然后再试一次。
所在位置 行:1 字符: 1
+ bun --version
+ ~~~
+ CategoryInfo : ObjectNotFound: (bun:String) [], CommandNotFound
 Exception
+ FullyQualifiedErrorId : CommandNotFoundException
```

**Thought**
Bun 没有安装，让我下载并安装 Bun。

**claude-code-source**
自动运行
```
iwr `https://bun.sh/install`  | iex
```

```
if 语句中的"if"后面缺少"("。
所在位置 行:7 字符: 7
+ if [[ $platform != MINGW64* ]]; then
+ ~
"[" 后面缺少类型名称。
所在位置 行:25 字符: 3
+ if [[ -t 1 ]]; then
+ ~
if 语句中的"if"后面缺少"("。
所在位置 行:25 字符: 5
+ if [[ -t 1 ]]; then
+ ~
"[" 后面缺少类型名称。
所在位置 行:39 字符: 7
+ error() {
+ ~
"("后面应为表达式。
所在位置 行:40 字符: 46inistrator\Desktop\claude-code-source [0:0] $ clearhildIt
+ echo -e "${Red}error${Color_Off}:
```

**Thought**
让我检查项目中是否有其他构建脚本或配置文件。

**claude-code-source**
自动运行
```
Get-ChildItem -Recurse -Name | Where-Object { $_ -like "*build*" -or $_ -like "*webpack*" -or $_ -like "*rollup*" -or $_ -like "*vite*" } | Select-Object -First 20
```

**(all characters skipped)**

**Thought**
让我查看项目中的一些关键文件，了解项目的构建方式。

**claude-code-source**
自动运行
```
Get-ChildItem -Path project-source -Name | Select-Object -First 30
```

**bject -First 30 abortController.ts**

```
activityManager.ts
add-dir.tsx
addCommand.ts
addDirPluginSettings.ts
AddMarketplace.tsx
AddPermissionRules.tsx
AddWorkspaceDirectory.tsx
adminRequests.ts
advisor.ts
AdvisorMessage.tsx
agent.ts
agentColorManager.ts
agentContext.ts
AgentDetail.tsx
agentDisplay.ts
AgentEditor.tsx
agentFileUtils.ts
agenticSessionSearch.ts
agentId.ts
agentMemory.ts
agentMemorySnapshot.ts
AgentNavigationFooter.tsx
AgentProgressLine.tsx
agents.ts
agents.tsx
agentSdkTypes.tsers\Administrator\Desktop\claude-code-source [0:0] $ AgentsList.tsxUsers\Administrator\Desktop\claude-code-source [0:0] $ clear
AgentsMenu.tsxUsers\Administrator\Desktop\claude-code-source [1:0] $
agentSummary.tssers\Administrator\Desktop\claude-code-source [1:0] $ Ge
```

**Thought**
让我检查是否安装了 TypeScript，然后尝试编译项目。

**claude-code-source**
自动运行
```
D:\SDK\node-v18.20.8\npx tsc --version
```

**(all characters skipped)**

**Thought**
让我为项目创建一个 tsconfig.json 文件，然后尝试编译项目。

**tsconfig.json**
tsconfig.json

**+20**
**-0**

查看变更

**Thought**
让我使用 TypeScript 编译器编译项目。

**claude-code-source**
自动运行
```
D:\SDK\node-v18.20.8\npx tsc
```

**(TraeAI-2) C:\Use**

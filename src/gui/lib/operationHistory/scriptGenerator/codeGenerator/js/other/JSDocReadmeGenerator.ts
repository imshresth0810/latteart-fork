/**
 * Copyright 2021 NTT Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export class JSDocReadmeGenerator {
  public generate(
    testSuiteNameToTopPageUrl: Map<string, string>,
    pageObjectNameToAlias: Map<string, string>
  ): string {
    return `\
${this.buildTestSuiteTable(testSuiteNameToTopPageUrl)}

${this.buildPageObjectTable(pageObjectNameToAlias)}
`;
  }

  private buildTestSuiteTable(testSuiteNameToTopPageUrl: Map<string, string>) {
    const header = `\


|#|name|top page url|
|:--|:--|:--|
`;

    const rows = [...testSuiteNameToTopPageUrl.entries()]
      .map(([name, topPageUrl], index) => {
        const href = encodeURI(encodeURI(`./${name}.html`));

        return `|${index + 1}|<a href="${href}">${name}</a>|${topPageUrl}|`;
      })
      .join("\n");

    return `\
## Test suites${rows.length > 0 ? header : ""}${rows}`;
  }

  private buildPageObjectTable(pageObjectNameToAlias: Map<string, string>) {
    const header = `\


|#|name|source|
|:--|:--|:--|
`;

    const rows = [...pageObjectNameToAlias.entries()]
      .map(([name, alias], index) => {
        const href = encodeURI(encodeURI(`./${alias}.html`));

        return `|${index + 1}|<a href="${href}">${alias}</a>|${name}|`;
      })
      .join("\n");

    return `\
## Page objects${rows.length > 0 ? header : ""}${rows}`;
  }
}
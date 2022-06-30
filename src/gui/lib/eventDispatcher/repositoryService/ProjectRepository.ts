/**
 * Copyright 2022 NTT Corporation.
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

import { RESTClient } from "../RESTClient";
import {
  RepositoryAccessResult,
  RepositoryAccessSuccess,
  createRepositoryAccessFailure,
  createConnectionRefusedFailure,
} from "@/lib/captureControl/Reply";
import { Project } from "@/lib/testManagement/types";
import { TestManagementData } from "@/lib/testManagement/TestManagementData";

export class ProjectRepository {
  constructor(private restClient: RESTClient) {}

  /**
   * Creates export project or testresult or all.
   * @param projectId  Project ID.
   * @param selectOption  Select option.
   * @returns Export File URL.
   */
  public async postProjectForExport(
    projectId: string,
    selectOption: { includeProject: boolean; includeTestResults: boolean }
  ): Promise<RepositoryAccessResult<{ url: string }>> {
    try {
      const response = await this.restClient.httpPost(
        `/projects/${projectId}/export`,
        selectOption
      );

      if (response.status !== 200) {
        return createRepositoryAccessFailure(response);
      }

      return new RepositoryAccessSuccess({
        data: response.data as { url: string },
      });
    } catch (error) {
      return createConnectionRefusedFailure();
    }
  }

  public async getProjects(): Promise<
    RepositoryAccessResult<
      Array<{
        id: string;
        name: string;
        createdAt: string;
      }>
    >
  > {
    try {
      const response = await this.restClient.httpGet(`/projects`);

      if (response.status !== 200) {
        return createRepositoryAccessFailure(response);
      }

      return new RepositoryAccessSuccess({
        data: response.data as Array<{
          id: string;
          name: string;
          createdAt: string;
        }>,
      });
    } catch (error) {
      return createConnectionRefusedFailure();
    }
  }

  public async getProject(
    projectId: string
  ): Promise<RepositoryAccessResult<Project>> {
    try {
      const response = await this.restClient.httpGet(`/projects/${projectId}`);

      if (response.status !== 200) {
        return createRepositoryAccessFailure(response);
      }

      return new RepositoryAccessSuccess({
        data: response.data as Project,
      });
    } catch (error) {
      return createConnectionRefusedFailure();
    }
  }

  public async postProject(): Promise<
    RepositoryAccessResult<{ id: string; name: string }>
  > {
    try {
      const response = await this.restClient.httpPost(`/projects`, {
        name: "",
      });

      if (response.status !== 200) {
        return createRepositoryAccessFailure(response);
      }

      return new RepositoryAccessSuccess({
        data: response.data as { id: string; name: string },
      });
    } catch (error) {
      return createConnectionRefusedFailure();
    }
  }

  /**
   * Update the project with the specified project ID.
   * @param projectId  Project ID.
   * @param body  Project information to update.
   * @returns Updated project information.
   */
  public async putProject(
    projectId: string,
    body: TestManagementData
  ): Promise<RepositoryAccessResult<Project>> {
    try {
      const response = await this.restClient.httpPut(
        `/projects/${projectId}`,
        body
      );

      if (response.status !== 200) {
        return createRepositoryAccessFailure(response);
      }

      return new RepositoryAccessSuccess({
        data: response.data as Project,
      });
    } catch (error) {
      return createConnectionRefusedFailure();
    }
  }
}
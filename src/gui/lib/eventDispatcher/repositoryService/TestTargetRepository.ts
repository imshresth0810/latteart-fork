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
  createConnectionRefusedFailure,
  createRepositoryAccessFailure,
  RepositoryAccessResult,
  RepositoryAccessSuccess,
} from "@/lib/captureControl/Reply";
import { TestTarget } from "@/lib/testManagement/types";

export class TestTargetRepository {
  constructor(private restClient: RESTClient) {}

  public async getTestTarget(
    id: string
  ): Promise<RepositoryAccessResult<TestTarget>> {
    try {
      const response = await this.restClient.httpGet(`/test-targets/${id}`);
      if (response.status !== 200) {
        return createRepositoryAccessFailure(response);
      }

      return new RepositoryAccessSuccess({
        data: response.data as TestTarget,
      });
    } catch (error) {
      return createConnectionRefusedFailure();
    }
  }

  public async postTestTarget(body: {
    testTargetGroupId: string;
    name: string;
  }): Promise<RepositoryAccessResult<TestTarget>> {
    try {
      const response = await this.restClient.httpPost(`/test-targets`, body);
      if (response.status !== 200) {
        return createRepositoryAccessFailure(response);
      }

      return new RepositoryAccessSuccess({
        data: response.data as TestTarget,
      });
    } catch (error) {
      return createConnectionRefusedFailure();
    }
  }

  public async patchTestTarget(
    id: string,
    body: {
      name?: string;
      index?: number;
      plans?: {
        viewPointId: string;
        value: number;
      }[];
    }
  ): Promise<RepositoryAccessResult<TestTarget>> {
    try {
      const response = await this.restClient.httpPatch(
        `/test-targets/${id}`,
        body
      );

      if (response.status !== 200) {
        return createRepositoryAccessFailure(response);
      }

      return new RepositoryAccessSuccess({
        data: response.data as TestTarget,
      });
    } catch (error) {
      return createConnectionRefusedFailure();
    }
  }

  public async deleteTestTarget(
    id: string
  ): Promise<RepositoryAccessResult<void>> {
    try {
      const response = await this.restClient.httpDelete(`/test-targets/${id}`);
      if (response.status !== 204) {
        return createRepositoryAccessFailure(response);
      }

      return new RepositoryAccessSuccess(response.data as { data: void });
    } catch (error) {
      return createConnectionRefusedFailure();
    }
  }
}

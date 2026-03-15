import { issueService } from 'services/IssueService';
import { catchErrors } from 'errors';

export const getProjectIssues = catchErrors(async (req, res) => {
  const { projectId } = req.currentUser;
  const { searchTerm } = req.query;

  const issues = await issueService.searchByProject({
    projectId,
    searchTerm: searchTerm ? String(searchTerm) : undefined,
  });

  res.respond({ issues });
});

export const getIssueWithUsersAndComments = catchErrors(async (req, res) => {
  const { projectId } = req.currentUser;
  const issue = await issueService.findByIdAndProject(
    Number(req.params.issueId),
    projectId,
  );
  res.respond({ issue });
});

export const create = catchErrors(async (req, res) => {
  const { projectId, id: reporterId } = req.currentUser;
  const issue = await issueService.create(projectId, reporterId, req.body);
  res.respond({ issue });
});

export const update = catchErrors(async (req, res) => {
  const { projectId } = req.currentUser;
  const issue = await issueService.update(
    Number(req.params.issueId),
    projectId,
    req.body,
  );
  res.respond({ issue });
});

export const remove = catchErrors(async (req, res) => {
  const { projectId } = req.currentUser;
  const issue = await issueService.delete(
    Number(req.params.issueId),
    projectId,
  );
  res.respond({ issue });
});

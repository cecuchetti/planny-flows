import { Comment, Issue } from 'entities';
import { catchErrors, EntityNotFoundError } from 'errors';

export const create = catchErrors(async (req, res) => {
  const { projectId } = req.currentUser;
  const { issueId, userId, body } = req.body;

  // Verify issue belongs to user's project
  const issue = await Issue.findOne({
    where: { id: issueId, projectId },
  });

  if (!issue) {
    throw new EntityNotFoundError('Issue');
  }

  const comment = Comment.create({
    issueId,
    userId,
    body,
  });
  await comment.save();
  res.respond({ comment });
});

export const update = catchErrors(async (req, res) => {
  const { projectId } = req.currentUser;
  const { commentId } = req.params;
  const { body } = req.body;

  // Verify comment's issue belongs to user's project
  const comment = await Comment.findOne({
    where: { id: Number(commentId) },
    relations: ['issue'],
  });

  if (!comment || comment.issue.projectId !== projectId) {
    throw new EntityNotFoundError('Comment');
  }

  comment.body = body;
  await comment.save();
  res.respond({ comment });
});

export const remove = catchErrors(async (req, res) => {
  const { projectId } = req.currentUser;
  const { commentId } = req.params;

  // Verify comment's issue belongs to user's project
  const comment = await Comment.findOne({
    where: { id: Number(commentId) },
    relations: ['issue'],
  });

  if (!comment || comment.issue.projectId !== projectId) {
    throw new EntityNotFoundError('Comment');
  }

  await comment.remove();
  res.respond({ comment });
});

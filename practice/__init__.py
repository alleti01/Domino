"""Practice scenarios for building the investigation agent. Made up; none is a real system.

Same calls and result shapes as the real data layer (contract v0.3), with mode="practice":

    from practice import describe_world, dependency_path, list_tables, lookup, run_experiment, list_worlds

Labels for scoring are in practice/answers.json. The agent itself must never read that file.
"""

from .api import dependency_path, describe_world, list_tables, list_worlds, lookup, run_experiment

__all__ = ["describe_world", "dependency_path", "list_tables", "lookup", "run_experiment", "list_worlds"]
